// The public surface a page imports from "explain". Every export carries a JSDoc
// example; pages import nothing else except React hooks.
import "./style.css";

export { Explanation, Opening, Note, Specifics, Diff, Check, Also, Validation, Files } from "./components";
export { Ref } from "./code";
export { Flow, type FlowNode, type FlowEdge, type FlowProps } from "./flow";
export { useCode, useSource, type ResolvedSource, type ResolvedRef, type CodeLine, type ChangedFile } from "./source";
export type { DiagramMark, Mark, Risk } from "./types";
export { useEffect, useMemo, useRef, useState } from "react";
