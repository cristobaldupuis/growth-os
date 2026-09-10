// ErrorBoundary — the last thing between a render error and a blank page.
//
// React unmounts the entire tree when a render throws and nothing above it
// catches. In this app that meant one malformed record — an initiative with a
// null where a view expected an array, a performance row with a dimension the
// parser did not produce — turned the whole application into a white screen
// with the console the only witness. For a product whose first impression is a
// demo, that is the single worst failure mode available: not a wrong number, but
// nothing at all.
//
// This holds the failure to the view that threw. The sidebar, the header and the
// workspace state stay up, the visitor is told what happened in plain words and
// has two ways out — try again, or return to the dashboard — and the error is
// still logged in full for whoever is debugging.
//
// A class component because React has no hook equivalent of
// getDerivedStateFromError; this is the one place in the codebase that needs
// one, and it is small enough that a library would cost more than it saved.
//
// `resetKey` is how navigation clears it: App passes the current view name, so
// leaving the view that broke mounts the next one clean rather than showing the
// previous view's error over a route it has nothing to do with.

import { Component } from "react";
import { gG, gGh } from "./styles.js";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // The full stack, server-side or in devtools. The UI shows the message only:
    // a component stack is noise to the person looking at it and describes the
    // bundle to anyone else.
    console.error("View render failed:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { t, onHome, label = "This view" } = this.props;
    const message = error?.message ? String(error.message).slice(0, 240) : "an unexpected error";

    return (
      <div role="alert" style={{ padding: "48px 20px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
          Something went wrong
        </div>
        <div style={{ color: t.text, fontFamily: t.serif, fontSize: 20, fontWeight: 600, marginBottom: 10 }}>
          {label} could not be drawn.
        </div>
        <div style={{ color: t.textSub, fontSize: 14, lineHeight: 1.55, marginBottom: 22 }}>
          Your workspace is intact — nothing was lost. The error was: <span style={{ fontFamily: t.mono, fontSize: 12 }}>{message}</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={gG(t)} onClick={() => this.setState({ error: null })}>Try again</button>
          {onHome && <button style={gGh(t)} onClick={onHome}>Back to dashboard</button>}
        </div>
      </div>
    );
  }
}
