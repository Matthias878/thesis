//TODO maybe integrate into StatusSystem
export function getBackendDotColor(backend) {
  return backend?.level === "down"
    ? "#ff3b3b"
    : backend?.level === "busy"
    ? "#ff9f1a"
    : backend?.ok === false
    ? "#ff3b3b"
    : "#2ee66b";
}

export function getBackendText(backend) {
  return (
    backend?.text ??
    (typeof backend?.ok === "boolean" ? (backend.ok ? "backend ok" : "backend down") : "backend status: —")
  );
}

export function getPosLeftRight(pos) {
  const posLeft = pos?.i ?? (typeof pos?.x1 === "number" ? Math.round(pos.x1) : null);
  const posRight = pos?.j ?? (typeof pos?.x2 === "number" ? Math.round(pos.x2) : null);
  return { posLeft, posRight };
}