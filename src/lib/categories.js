import { supabase, unwrap } from "./supabase";

export const fetchCategories = async () => unwrap(await supabase.from("categories").select("id, name").order("name"));

// The id comes from the device (queue.js), so the category can be renamed or deleted before it reaches the server.
export const createCategory = async ({ id, name }) =>
    unwrap(await supabase.from("categories").upsert({ id, name }).select("id, name").single());

// Notes carry the category by name, so a rename or delete touches them too.
export const renameCategory = async (id, from, to) => {
    if (id) unwrap(await supabase.from("categories").update({ name: to }).eq("id", id));
    unwrap(await supabase.from("notes").update({ category: to }).eq("category", from));
};

export const deleteCategory = async (id, name) => {
    if (id) unwrap(await supabase.from("categories").delete().eq("id", id));
    unwrap(await supabase.from("notes").update({ category: "" }).eq("category", name));
};
