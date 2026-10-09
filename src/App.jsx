import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import Home from "./pages/Home/Home";
import Login from "./pages/Login/Login"
import MfaCode from "./pages/Login/MfaCode";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { isSupabaseConfigured } from "./lib/supabase";

const RequireAuth = ({ children }) => {
    const { session, needsMfa, loading } = useAuth();
    if (loading) return null;
    return session && !needsMfa ? children : <Navigate to="/login" replace />;
}

const RedirectIfAuthed = ({ children }) => {
    const { session, needsMfa, loading } = useAuth();
    if (loading) return null;
    if (needsMfa) return <MfaCode />;
    return session ? <Navigate to="/dashboard" replace /> : children;
}

const routes = (
    <Router>
        <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    </Router>
)

const App = () => {
    if (!isSupabaseConfigured) {
        return (
            <div className="max-w-[480px] mx-auto px-4 py-20 text-center">
                <h1 className="text-2xl font-bold">Supabase não configurado</h1>
                <p className="mt-4 text-light-text-color-secondary dark:text-dark-text-color-secondary">
                    Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente.
                </p>
            </div>
        )
    }

    return (
        <AuthProvider>
            <div>{routes}</div>
        </AuthProvider>
    )
}

export default App
