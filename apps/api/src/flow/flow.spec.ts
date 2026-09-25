import { deriveFlow } from "./flow.module";

describe("deriveFlow", () => {
  it.each([
    [{ scheduleStatus: "SCHEDULED", sessionStatus: null, hasMachine: false }, "arrival", "check-in", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: null, hasMachine: false }, "pre", "record-pre-dialysis", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "PRE_DIALYSIS", hasMachine: false }, "supplies", "confirm-supplies", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "SUPPLIES_READY", hasMachine: false }, "machine", "assign-machine", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "WAITING_MACHINE", hasMachine: false }, "machine", "assign-machine", "WAITING_MACHINE"],
    [{ scheduleStatus: "LATE", sessionStatus: "ASSIGNED", hasMachine: true }, "dialysis", "start-dialysis", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "IN_DIALYSIS", hasMachine: true }, "dialysis", "record-readings", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "INTERRUPTED", hasMachine: true }, "dialysis", "resume-dialysis", "INTERRUPTED"],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "COMPLETED", hasMachine: true }, "discharge", "discharge", null],
    [{ scheduleStatus: "ARRIVED", sessionStatus: "DISCHARGED", hasMachine: true }, null, null, null],
    [{ scheduleStatus: "ABSENT", sessionStatus: null, hasMachine: false }, "arrival", "check-in", "ABSENT"],
    [{ scheduleStatus: "CANCELLED", sessionStatus: "CANCELLED", hasMachine: false }, null, null, null],
  ] as const)("%j -> %s / %s", (input, current, action, attention) => {
    const flow = deriveFlow(input as never);
    expect(flow.current).toBe(current);
    expect(flow.action).toBe(action);
    expect(flow.attention).toBe(attention);
  });
});
