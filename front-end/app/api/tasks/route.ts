import { connection } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  assertSameOrigin,
  readJsonObject,
  requireApiUser,
  requireUuid,
} from "@/lib/backend/http";

const PRIORITIES = ["low", "medium", "high"] as const;
const STATUSES = ["pending", "in_progress", "done"] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(`${label} must be one of: ${allowed.join(", ")}.`, 400);
  }
  return value as T;
}

// Employees receive the tasks assigned to them; managers receive every task at
// their site. Row Level Security decides which rows come back.
export async function GET() {
  await connection();
  try {
    const { supabase } = await requireApiUser(["employee", "manager"]);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, site_id, assigned_to, title, priority, status, due_at, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return Response.json({ tasks: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["manager"]);
    const body = await readJsonObject(request);

    const assignedTo = requireUuid(body.assignedTo, "Assignee");
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 1 || title.length > 200) {
      throw new ApiError("Task title must be between 1 and 200 characters.", 400);
    }
    const priority = oneOf(body.priority ?? "medium", PRIORITIES, "Priority");

    let dueAt: string | null = null;
    if (body.dueAt !== undefined && body.dueAt !== null && body.dueAt !== "") {
      const parsed = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        throw new ApiError("Due date must be a valid date and time.", 400);
      }
      dueAt = parsed.toISOString();
    }

    const { data, error } = await supabase.rpc("create_task", {
      p_assigned_to: assignedTo,
      p_title: title,
      p_priority: priority,
      p_due_at: dueAt,
    });
    if (error) throw error;
    return Response.json({ task: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireApiUser(["employee", "manager"]);
    const body = await readJsonObject(request);
    const taskId = requireUuid(body.taskId, "Task");
    const status = oneOf(body.status, STATUSES, "Status");

    const { data, error } = await supabase.rpc("set_task_status", {
      p_task_id: taskId,
      p_status: status,
    });
    if (error) throw error;
    return Response.json({ task: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
