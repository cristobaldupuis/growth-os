-- Server-side performance aggregation. The browser and MCP callers should never
-- have to read an arbitrary number of fact rows just to answer a summary question.
--
-- Metrics are stored as JSONB because source platforms expose different fields.
-- The importer normalises the additive metrics to numeric JSON values, so the
-- casts below are deterministic. Ratios are deliberately derived from summed
-- numerators/denominators rather than summed or averaged source ratios.

create or replace function performance_summary(
  p_workspace  uuid,
  p_channel    text default null,
  p_date_from  date default null,
  p_date_to    date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with filtered as (
    select
      date,
      coalesce(channel, 'unknown') as channel,
      coalesce((metrics->>'spend')::numeric, 0) as spend,
      coalesce((metrics->>'conversions')::numeric, 0) as conversions,
      coalesce((metrics->>'revenue')::numeric, 0) as revenue,
      coalesce((metrics->>'impressions')::numeric, 0) as impressions,
      coalesce((metrics->>'clicks')::numeric, 0) as clicks,
      coalesce((metrics->>'reach')::numeric, 0) as reach
    from performance_rows
    where workspace_id = p_workspace
      and (p_channel is null or channel = p_channel)
      and (p_date_from is null or date >= p_date_from)
      and (p_date_to is null or date <= p_date_to)
  ),
  totals as (
    select
      count(*)::bigint as rows,
      coalesce(sum(spend), 0) as spend,
      coalesce(sum(conversions), 0) as conversions,
      coalesce(sum(revenue), 0) as revenue,
      coalesce(sum(impressions), 0) as impressions,
      coalesce(sum(clicks), 0) as clicks,
      coalesce(sum(reach), 0) as reach
    from filtered
  ),
  channels as (
    select
      channel,
      count(*)::bigint as rows,
      sum(spend) as spend,
      sum(conversions) as conversions,
      sum(revenue) as revenue,
      sum(impressions) as impressions,
      sum(clicks) as clicks,
      sum(reach) as reach
    from filtered
    group by channel
    order by spend desc, channel
  ),
  days as (
    select
      date,
      count(*)::bigint as rows,
      sum(spend) as spend,
      sum(conversions) as conversions,
      sum(revenue) as revenue,
      sum(impressions) as impressions,
      sum(clicks) as clicks,
      sum(reach) as reach
    from filtered
    where date is not null
    group by date
    order by date
  ),
  ratio_json as (
    select
      jsonb_build_object(
        'roas', case when t.spend > 0 then t.revenue / t.spend else null end,
        'cpa', case when t.conversions > 0 then t.spend / t.conversions else null end,
        'cpc', case when t.clicks > 0 then t.spend / t.clicks else null end,
        'cpm', case when t.impressions > 0 then t.spend / t.impressions * 1000 else null end,
        'ctr', case when t.impressions > 0 then t.clicks / t.impressions * 100 else null end,
        'cvr', case when t.clicks > 0 then t.conversions / t.clicks * 100 else null end
      ) as ratios
    from totals t
  )
  select jsonb_build_object(
    'rows', t.rows,
    'spend', t.spend,
    'conversions', t.conversions,
    'revenue', t.revenue,
    'impressions', t.impressions,
    'clicks', t.clicks,
    'reach', t.reach,
    'roas', case when t.spend > 0 then t.revenue / t.spend else null end,
    'cpa', case when t.conversions > 0 then t.spend / t.conversions else null end,
    'cpc', case when t.clicks > 0 then t.spend / t.clicks else null end,
    'cpm', case when t.impressions > 0 then t.spend / t.impressions * 1000 else null end,
    'ctr', case when t.impressions > 0 then t.clicks / t.impressions * 100 else null end,
    'cvr', case when t.clicks > 0 then t.conversions / t.clicks * 100 else null end,
    'byChannel', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'channel', c.channel,
          'rows', c.rows,
          'spend', c.spend,
          'conversions', c.conversions,
          'revenue', c.revenue,
          'impressions', c.impressions,
          'clicks', c.clicks,
          'reach', c.reach,
          'roas', case when c.spend > 0 then c.revenue / c.spend else null end,
          'cpa', case when c.conversions > 0 then c.spend / c.conversions else null end,
          'cpc', case when c.clicks > 0 then c.spend / c.clicks else null end,
          'cpm', case when c.impressions > 0 then c.spend / c.impressions * 1000 else null end,
          'ctr', case when c.impressions > 0 then c.clicks / c.impressions * 100 else null end,
          'cvr', case when c.clicks > 0 then c.conversions / c.clicks * 100 else null end
        )
      ) from channels c
    ), '[]'::jsonb),
    'byDate', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', d.date,
          'rows', d.rows,
          'spend', d.spend,
          'conversions', d.conversions,
          'revenue', d.revenue,
          'impressions', d.impressions,
          'clicks', d.clicks,
          'reach', d.reach,
          'roas', case when d.spend > 0 then d.revenue / d.spend else null end,
          'cpa', case when d.conversions > 0 then d.spend / d.conversions else null end,
          'cpc', case when d.clicks > 0 then d.spend / d.clicks else null end,
          'cpm', case when d.impressions > 0 then d.spend / d.impressions * 1000 else null end,
          'ctr', case when d.impressions > 0 then d.clicks / d.impressions * 100 else null end,
          'cvr', case when d.clicks > 0 then d.conversions / d.clicks * 100 else null end
        )
      ) from days d
    ), '[]'::jsonb)
  )
  from totals t;
$$;

revoke all on function performance_summary(uuid, text, date, date) from public;
grant execute on function performance_summary(uuid, text, date, date) to service_role;
