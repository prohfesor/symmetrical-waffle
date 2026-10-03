import React from "react";
import { useAppState, useDispatch, useResolvedDrawing } from "../state/store.js";

export function ParamsPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { paramIssues, paramValues } = useResolvedDrawing();

  return (
    <div className="panel params-panel">
      <h3>Parameters (params.txt)</h3>
      <p className="panel-help">One <code>name = expression</code> per line. Reference other params, e.g. <code>height = width * 0.5 + 20</code>.</p>
      <textarea
        spellCheck={false}
        value={state.paramsText}
        onChange={(e) => dispatch({ type: "SET_PARAMS_TEXT", text: e.target.value })}
        rows={10}
      />
      {paramIssues.length > 0 && (
        <ul className="issue-list">
          {paramIssues.map((issue, i) => (
            <li key={i}>
              Line {issue.line} ({issue.param}): {issue.message}
            </li>
          ))}
        </ul>
      )}
      {paramValues.size > 0 && (
        <details className="values-preview">
          <summary>Resolved values</summary>
          <table>
            <tbody>
              {[...paramValues.entries()].map(([name, value]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{Number(value.toFixed(4))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
