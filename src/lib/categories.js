import { supabase } from "./supabase";

export const fetchCategories = async () => {
    const { data, error } = await supabase.from("categories").select("id, name").order("name");
    if (error) throw error;
    return data;
};

export const createCategory = async (name) => {
    const { data, error } = await supabase.from("categories").insert({ name }).select("id, name").single();
    if (error) throw error;
    return data;
};

// Notes carry the category by name, so a rename or delete touches them too.
export const renameCategory = async (id, from, to) => {
    if (id) {
        const { error } = await supabase.from("categories").update({ name: to }).eq("id", id);
        if (error) throw error;
    }
    const notes = await supabase.from("notes").update({ category: to }).eq("category", from);
    if (notes.error) throw notes.error;
};

export const deleteCategory = async (id, name) => {
    if (id) {
        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) throw error;
    }
    const notes = await supabase.from("notes").update({ category: "" }).eq("category", name);
    if (notes.error) throw notes.error;
};
