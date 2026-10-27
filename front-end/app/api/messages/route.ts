import { connection } from "next/server";

import {
  ApiError,
  apiErrorResponse,
  assertSameOrigin,
  readJsonObject,
  requireApiUser,
} from "@/lib/backend/http";

type ConversationRow = {
  id: string;
  site_id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

async function loadSenderNames(
  supabase: Awaited<ReturnType<typeof requireApiUser>>["supabase"],
  conversationIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (conversationIds.length === 0) return names;
  const { data, error } = await supabase.rpc("message_sender_names", {
    p_conversation_ids: conversationIds,
  });
  if (error) throw error;
  for (const row of (data ?? []) as { sender_id: string; full_name: string | null }[]) {
    if (row.full_name) names.set(row.sender_id, row.full_name);
  }
  return names;
}

function trimText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new ApiError(`${label} must be a string.`, 400);
  }
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new ApiError(`${label} must be between ${min} and ${max} characters.`, 400);
  }
  return result;
}

function canAccessConversation(profile: { role: string; home_site_id: string | null }, conversationSiteId: string | null) {
  if (!conversationSiteId) return false;
  if (profile.role === "admin") return true;
  return profile.home_site_id === conversationSiteId;
}

export async function GET(request: Request) {
  await connection();
  try {
    const { supabase, profile } = await requireApiUser(["employee", "manager", "admin"]);
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("site_conversations")
        .select("id, site_id, title, created_by, created_at, updated_at")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) {
        throw new ApiError("Conversation not found.", 404);
      }
      if (!canAccessConversation(profile, conversation.site_id)) {
        throw new ApiError("You do not have access to that conversation.", 403);
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from("site_messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (messagesError) throw messagesError;
      const names = await loadSenderNames(supabase, [conversationId]);

      return Response.json({
        conversation,
        messages: (messageRows ?? []).map((row) => ({
          id: row.id,
          conversation_id: row.conversation_id,
          sender_id: row.sender_id,
          body: row.body,
          created_at: row.created_at,
          sender_name: names.get(row.sender_id) ?? null,
        })),
      });
    }

    const { data: conversationRows, error: conversationError } = await supabase
      .from("site_conversations")
      .select("id, site_id, title, created_by, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (conversationError) throw conversationError;
    const conversations = (conversationRows ?? []).filter((conversation: ConversationRow) =>
      canAccessConversation(profile, conversation.site_id),
    );

    const conversationIds = conversations.map((conversation) => conversation.id);
    let messageRows: MessageRow[] = [];
    if (conversationIds.length > 0) {
      const { data, error: messagesError } = await supabase
        .from("site_messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true });
      if (messagesError) throw messagesError;
      messageRows = (data ?? []) as MessageRow[];
    }

    const names = await loadSenderNames(supabase, conversationIds);
    const messagesByConversation = new Map<string, Array<Record<string, string | null>>>();
    for (const row of messageRows) {
      const existing = messagesByConversation.get(row.conversation_id) ?? [];
      const senderName = names.get(row.sender_id) ?? null;
      existing.push({
        id: row.id,
        sender_id: row.sender_id,
        body: row.body,
        created_at: row.created_at,
        sender_name: senderName,
      });
      messagesByConversation.set(row.conversation_id, existing);
    }

    return Response.json({
      conversations: conversations.map((conversation) => ({
        ...conversation,
        messages: messagesByConversation.get(conversation.id) ?? [],
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase, profile } = await requireApiUser(["employee", "manager", "admin"]);
    const body = await readJsonObject(request);
    const content = trimText(body.content, "Message", 1, 2000);

    const siteId =
      typeof body.siteId === "string" && body.siteId
        ? body.siteId
        : profile.home_site_id;

    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;

    if (conversationId) {
      const { data: conversation, error: conversationError } = await supabase
        .from("site_conversations")
        .select("id, site_id, title")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) {
        throw new ApiError("Conversation not found.", 404);
      }
      if (!canAccessConversation(profile, conversation.site_id)) {
        throw new ApiError("You do not have access to that conversation.", 403);
      }

      const { data: message, error: sendError } = await supabase
        .from("site_messages")
        .insert({ conversation_id: conversationId, sender_id: profile.id, body: content })
        .select("id, conversation_id, sender_id, body, created_at")
        .single();
      if (sendError) throw sendError;

      return Response.json({ message, conversationId }, { status: 201 });
    }

    const title = trimText(body.title ?? "Site updates", "Title", 1, 80);
    if (profile.role === "employee" && !profile.home_site_id) {
      throw new ApiError("Your account has no home site. Contact your administrator.", 403);
    }
    if (profile.role === "manager" && !profile.home_site_id) {
      throw new ApiError("Your account has no home site. Contact your administrator.", 403);
    }
    if (profile.role === "admin" && !siteId) {
      throw new ApiError("Choose a site before creating a message thread.", 400);
    }

    const { data: conversation, error: createConversationError } = await supabase
      .from("site_conversations")
      .insert({
        site_id: siteId,
        created_by: profile.id,
        title,
      })
      .select("id, site_id, title, created_by, created_at, updated_at")
      .single();
    if (createConversationError) throw createConversationError;

    const { data: message, error: createMessageError } = await supabase
      .from("site_messages")
      .insert({ conversation_id: conversation.id, sender_id: profile.id, body: content })
      .select("id, conversation_id, sender_id, body, created_at")
      .single();
    if (createMessageError) throw createMessageError;

    return Response.json({ conversation, message }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
