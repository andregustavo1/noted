import { supabase } from "./supabase";

const FIELDS = "id, title, content, category, is_pinned, created_at, updated_at";

export const fetchNotes = async () => {
    const { data, error } = await supabase
        .from("notes")
        .select(FIELDS)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });

    if (error) throw error;
    return data;
};

export const createNote = async ({ title, content, category, is_pinned = false }) => {
    const { data, error } = await supabase
        .from("notes")
        .insert({ title, content, category, is_pinned })
        .select(FIELDS)
        .single();

    if (error) throw error;
    return data;
};

export const updateNote = async (id, changes) => {
    const { data, error } = await supabase
        .from("notes")
        .update(changes)
        .eq("id", id)
        .select(FIELDS)
        .single();

    if (error) throw error;
    return data;
};

export const deleteNote = async (id) => {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw error;
};
