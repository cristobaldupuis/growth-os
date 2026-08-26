-- Marketers Lab — server-side debate execution
--
-- ## Run this one too
--
-- Like 0003_runtime.sql and unlike 0001/0002, this migration is live: api/debate.js
-- does not work without it.
--
-- ## What this is for
--
-- A Signal AI debate is 25-48 reasoning-model calls over several minutes. It used
-- to run entirely in the browser, which meant the loop *was* the page: closing the
-- tab killed it. The previous change made that non-destructive — every turn is
-- saved, and an unfinished debate can be synthesised later in one call — but the
-- honest limit stood, and "resume it afterwards" is not the same thing as "it kept
-- going".
--
-- So the loop moves to the server and this table is where it lives. The browser
-- starts a run and then only reads it. Closing the tab now costs nothing at all:
-- nothing on the page was driving the work.
--
-- ## Why the whole job is one row
--
-- Every field a step needs to decide what to do next is here, because a serverless
-- invocation starts with no memory of the one before it. A step loads this row,
-- does exactly one model call, writes the row back, and hands off. There is no
-- in-process state between steps and there deliberately cannot be — that is what
-- makes the work survive the process that started it.
--
-- `snapshot` is the portfolio the debate is arguing about, frozen at start. The
-- server has no access to the operator's browser storage, so the client sends it
-- once. Freezing it is not a workaround: a debate that read live state would have
-- its later turns arguing about a different portfolio than its earlier ones, and
-- the transcript would no longer be interpretable against anything. Same discipline
-- as the initiative prediction snapshot.

-- ── debate_runs ──────────────────────────────────────────────────────────
create table if not exists debate_runs (
  id           text primary key,

  -- running | done | failed. `running` means a step is either executing or due
  -- to be picked up by the sweeper — see `lease_until`.
  status       text        not null default 'running',
  -- Which model call the NEXT step should make: agent_turn | moderator | synthesis.
  phase        text        not null default 'agent_turn',

  context      text        not null default '',
  snapshot     jsonb       not null,
  agents       jsonb       not null default '[]'::jsonb,
  max_turns    int         not null default 8,

  -- What the operator sees. Appended one entry per completed agent turn.
  transcript   jsonb       not null default '[]'::jsonb,
  -- What the model sees. The alternating user/assistant history the next turn
  -- is conditioned on; separate from `transcript` because they diverge — the
  -- moderator injects prompts here that are not turns anyone spoke.
  history      jsonb       not null default '[]'::jsonb,

  turn_index   int         not null default 0,
  -- The agent currently speaking, and the in-flight messages of its tool loop.
  -- A single agent turn can take several model calls (fetch, fetch, then answer),
  -- and each is its own step, so the partial conversation has to persist between
  -- them like everything else.
  current_agent jsonb,
  tool_messages jsonb      not null default '[]'::jsonb,
  tool_iters    int        not null default 0,

  results      jsonb,
  error        text,
  -- Why a step last handed off. Diagnostic only; the state machine reads `phase`.
  note         text,

  -- ## The lease
  --
  -- Two things can legitimately try to advance one run: the chain (each step
  -- dispatches the next) and the sweeper (which restarts runs whose chain broke).
  -- Without a lease both can run the same step, and the debate would fork — two
  -- invocations appending a turn to the same history, each unaware of the other,
  -- and both paying for it.
  --
  -- `claim_debate_step` below sets this atomically, so exactly one caller ever
  -- holds a run. It is a lease rather than a lock because the holder is a
  -- serverless function that can die without releasing anything; an expiry means
  -- a dead holder frees the run by doing nothing.
  lease_until  timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table debate_runs enable row level security;

-- The sweeper's query: runs that are still going and whose lease has lapsed.
create index if not exists debate_runs_sweep_idx
  on debate_runs (status, lease_until);

-- ── claim_debate_step ────────────────────────────────────────────────────
-- Take the lease on a run and return it, or return nothing.
--
-- One statement, for the same reason `increment_rate_limit` is one statement: a
-- SELECT followed by an UPDATE lets two callers both read an expired lease and
-- both decide they hold it. `UPDATE … WHERE … RETURNING` resolves that inside a
-- single row lock, so the row comes back to exactly one caller.
--
-- Returning zero rows is a normal outcome, not an error: it means somebody else
-- holds the run, which is precisely what the caller needs to know.
create or replace function claim_debate_step(p_id text, p_lease_seconds int)
returns setof debate_runs
language sql
security definer
set search_path = public, pg_temp
as $$
  update debate_runs
     set lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at  = now()
   where id = p_id
     and status = 'running'
     and (lease_until is null or lease_until < now())
  returning *;
$$;

-- ── sweep_stalled_debates ────────────────────────────────────────────────
-- Ids of runs that are still `running` but whose lease has lapsed — i.e. whose
-- chain broke. A step can die for reasons that leave no trace here (a cold-start
-- failure, a platform timeout, a deploy mid-flight), and without this the run
-- would sit at `running` forever with nothing driving it.
--
-- Bounded, and ordered oldest-first, so one sweep cannot fan out unboundedly.
create or replace function sweep_stalled_debates(p_limit int default 5)
returns setof text
language sql
security definer
set search_path = public, pg_temp
as $$
  select id
    from debate_runs
   where status = 'running'
     and (lease_until is null or lease_until < now())
   order by updated_at asc
   limit p_limit;
$$;

revoke all on function claim_debate_step(text, int) from public;
revoke all on function sweep_stalled_debates(int) from public;
grant execute on function claim_debate_step(text, int) to service_role;
grant execute on function sweep_stalled_debates(int) to service_role;
