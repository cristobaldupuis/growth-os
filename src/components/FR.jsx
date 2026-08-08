import { cloneElement, isValidElement, useId } from "react";

// -- Labelled field ------------------------------------------------------------
//
// The label primitive every form in the app uses. It used to render a bare
// `<label>` next to its input with no `htmlFor` and the input as a *sibling*
// rather than a child, so the association did not exist anywhere in the product:
// clicking a label focused nothing, and every field — around twenty in the
// initiative form alone — was unlabelled to a screen reader.
//
// Generating the id here and cloning it onto the control fixes every form at
// once, which is the whole reason this component exists. A child that already
// carries an `id` keeps it (the datalist-backed inputs need theirs to stay
// stable), and a child that is not a single element — a fragment holding an
// input plus its own hint — falls back to wrapping, which still associates.
export function FR({ label, t, children, hint, error, required }) {
  const id      = useId();
  const hintId  = hint  ? id + "-hint"  : undefined;
  const errorId = error ? id + "-error" : undefined;

  const single = isValidElement(children);
  const controlId = single ? (children.props.id || id) : id;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control = single
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? "true" : children.props["aria-invalid"],
        "aria-required": required ? "true" : children.props["aria-required"],
        ...(error ? { style: { ...(children.props.style||{}), borderColor: t.red } } : null),
      })
    : children;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <label htmlFor={single ? controlId : undefined}
        style={{fontSize:12,color:t.textMuted,fontFamily:t.serif,cursor:single?"pointer":"default",width:"fit-content"}}>
        {label}{required && <span aria-hidden="true" style={{color:t.gold,marginLeft:3}}>*</span>}
      </label>
      {control}
      {error && (
        <div id={errorId} role="alert" style={{fontSize:11,color:t.red,fontFamily:t.sans,fontWeight:600,lineHeight:1.45}}>
          {error}
        </div>
      )}
      {hint && !error && (
        <div id={hintId} style={{fontSize:11,color:t.textMuted,fontFamily:t.sans,lineHeight:1.45}}>
          {hint}
        </div>
      )}
    </div>
  );
}
