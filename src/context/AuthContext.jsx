import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext({ session: null, user: null, loading: true });

// The session as supabase-js keeps it on this device. It paints the app at once, and keeps it open offline: with the
// access token expired, getSession() can't refresh it and reports no session, although the account is still signed
// in here. supabase-js refreshes the stored one by itself once the network is back (onAuthStateChange then updates).
// A session the server refused is removed from storage by supabase-js, so this finds nothing then.
const storedSession = () => {
    try {
        const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
        const session = key && JSON.parse(localStorage.getItem(key));
        return session?.user && session.refresh_token ? session : null;
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(storedSession);
    const [loading, setLoading] = useState(() => !storedSession());

    useEffect(() => {
        supabase.auth.getSession().then(({ data, error }) => {
            // An error is the refresh failing to get through (offline): the stored session stands until it does.
            setSession(data.session ?? (error ? storedSession() : null));
            setLoading(false);
        });

        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
            // The initial event reports no session in the same offline case; getSession() above has already decided.
            if (event === "INITIAL_SESSION" && !newSession) return;
            setSession(newSession);
        });

        return () => data.subscription.unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// eslint-disable-next-line react-refresh/only-export-components
export const getUserName = (user) => user?.user_metadata?.name || user?.email?.split("@")[0] || "";
