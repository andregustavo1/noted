import { supabase, unwrap } from "./supabase";

const FIELDS = "id, title, content, category, color, is_pinned, created_at, updated_at";

export const fetchNotes = async () =>
    unwrap(
        await supabase
            .from("notes")
            .select(FIELDS)
            .order("is_pinned", { ascending: false })
            .order("updated_at", { ascending: false })
    );

// A new note comes with the id the device gave it; upsert so sending it twice (a reply lost offline) is harmless.
export const upsertNote = async ({ id, title, content, category, color = "", is_pinned = false }) =>
    unwrap(await supabase.from("notes").upsert({ id, title, content, category, color, is_pinned }).select(FIELDS).single());

// Null when the note no longer exists (deleted on another device): nothing left to update.
export const updateNote = async (id, changes) =>
    unwrap(await supabase.from("notes").update(changes).eq("id", id).select(FIELDS).maybeSingle());

export const deleteNote = async (id) => {
    unwrap(await supabase.from("notes").delete().eq("id", id));
};
