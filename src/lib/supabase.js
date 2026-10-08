import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

// The data of a query, or its error thrown with the HTTP status on it (0 when the request never got through),
// so sync.js can tell a lost connection from a refused change.
export const unwrap = ({ data, error, status }) => {
    if (error) throw Object.assign(error, { status });
    return data;
};
