import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar/Navbar";
import { useNavigate } from "react-router-dom";
import PasswordInput from "../../components/Input/PasswordInput";
import { supabase } from "../../lib/supabase";

const authErrorMessage = (error) => {
    switch (error.code) {
        case "invalid_credentials":
            return "E-mail ou senha incorretos";
        case "user_already_exists":
        case "email_exists":
            return "Este e-mail já está cadastrado";
        case "weak_password":
            return "Senha muito fraca";
        case "email_not_confirmed":
            return "Confirme seu e-mail para entrar";
        case "signup_disabled":
            return "Cadastro desativado";
        case "over_request_rate_limit":
        case "over_email_send_rate_limit":
            return "Muitas tentativas, tente mais tarde";
        default:
            return "Algo deu errado, tente novamente";
    }
}

// Smoothly center a field in the area left visible above the mobile keyboard.
// The keyboard only shrinks the visual viewport, so measure against that rather
// than the whole screen, and wait until it has finished opening.
const scrollToInput = (e) => {
    const input = e.target;
    const viewport = window.visualViewport;

    const center = () => {
        const visibleTop = viewport ? viewport.offsetTop : 0;
        const visibleHeight = viewport ? viewport.height : window.innerHeight;
        const rect = input.getBoundingClientRect();
        const offset = rect.top + rect.height / 2 - (visibleTop + visibleHeight / 2);
        if (Math.abs(offset) > 8) window.scrollBy({ top: offset, behavior: "smooth" });
    };

    if (!viewport) {
        setTimeout(center, 300);
        return;
    }

    // Center once the viewport stops resizing, or after a short wait when the
    // keyboard is already open (moving between fields) or there is none.
    let timeout = setTimeout(done, 500);
    function done() {
        viewport.removeEventListener("resize", onResize);
        center();
    }
    function onResize() {
        clearTimeout(timeout);
        timeout = setTimeout(done, 100);
    }
    viewport.addEventListener("resize", onResize);
}

// While the on-screen keyboard is open, extra space at the bottom of the page so
// even the lowest field can be scrolled up to the middle of the visible area.
const useKeyboardSpace = () => {
    const [space, setSpace] = useState(0);

    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const update = () => {
            const keyboard = Math.max(0, Math.round(window.innerHeight - viewport.height));
            setSpace(keyboard > 0 ? keyboard + Math.round(viewport.height / 2) : 0);
        };
        viewport.addEventListener("resize", update);
        return () => viewport.removeEventListener("resize", update);
    }, []);

    return space;
}

const Login = () => {
    const keyboardSpace = useKeyboardSpace();

    // The login fits the screen, so a downward swipe has nothing to scroll and the
    // browser turns it into pull-to-refresh. Disable that while this page is open.
    useEffect(() => {
        const elements = [document.documentElement, document.body];
        elements.forEach((el) => { el.style.overscrollBehaviorY = "none"; });
        return () => elements.forEach((el) => { el.style.overscrollBehaviorY = ""; });
    }, []);

    useEffect(() => {
        const overlay = document.getElementById("overlay");

        const panelOverlaySignUpBtn = document.querySelector("#panel-overlay-signup button");
        const panelOverlaySignUpContent = document.querySelector("#panel-overlay-signup");

        const panelOverlaySignInBtn = document.querySelector("#panel-overlay-signin button");
        const panelOverlaySignInContent = document.querySelector("#panel-overlay-signin");

        const panelWhiteSignIn = document.querySelector("#panel-white-signin");
        const panelWhiteSignUp = document.querySelector("#panel-white-signup");

        const signUpOverlayMobile = () => {
            overlay.classList.add("translate-y-[0%]");
            overlay.classList.remove("translate-y-[100%]");

            panelWhiteSignIn.classList.add("translate-y-[50%]");
            panelWhiteSignIn.classList.add("opacity-0");

            panelOverlaySignUpContent.classList.add("translate-y-[200%]", "opacity-0");
            panelOverlaySignInContent.classList.remove("translate-y-[-100%]", "opacity-0");

            panelWhiteSignUp.classList.add("translate-y-[100%]", "z-20");
            panelWhiteSignUp.classList.remove("opacity-0", "translate-y-[50%]");
        };

        const signInOverlayMobile = () => {
            overlay.classList.remove("translate-y-[0%]");
            overlay.classList.add("translate-y-[100%]");

            panelWhiteSignIn.classList.remove("translate-y-[50%]");
            panelWhiteSignIn.classList.remove("opacity-0");

            panelOverlaySignUpContent.classList.remove("translate-y-[200%]", "opacity-0");
            panelOverlaySignInContent.classList.add("translate-y-[-100%]", "opacity-0");

            panelWhiteSignUp.classList.remove("translate-y-[100%]", "z-20");
            panelWhiteSignUp.classList.add("opacity-0", "translate-y-[50%]");
        };

        const signUpOverlayDesktop = () => {
            overlay.classList.add("md:translate-x-[0%]");
            overlay.classList.remove("md:translate-x-[100%]");

            panelWhiteSignIn.classList.add("md:translate-x-[50%]");
            panelWhiteSignIn.classList.add("md:opacity-0");

            panelOverlaySignUpContent.classList.add("md:translate-x-[200%]", "opacity-0");
            panelOverlaySignInContent.classList.remove("md:translate-x-[-100%]", "opacity-0");

            panelWhiteSignUp.classList.add("md:translate-x-[100%]", "z-20");
            panelWhiteSignUp.classList.remove("opacity-0", "md:translate-x-[50%]");
        };

        const signInOverlayDesktop = () => {
            overlay.classList.remove("md:translate-x-[0%]");
            overlay.classList.add("md:translate-x-[100%]");

            panelWhiteSignIn.classList.remove("md:translate-x-[50%]");
            panelWhiteSignIn.classList.remove("md:opacity-0");

            panelOverlaySignUpContent.classList.remove("md:translate-x-[200%]", "opacity-0");
            panelOverlaySignInContent.classList.add("md:translate-x-[-100%]", "opacity-0");

            panelWhiteSignUp.classList.remove("md:translate-x-[100%]", "z-20");
            panelWhiteSignUp.classList.add("opacity-0", "md:translate-x-[50%]");
        };

        function screenOverlay() {
            if (window.innerWidth < 768) {
                panelOverlaySignUpBtn.addEventListener('click', signUpOverlayMobile);
                panelOverlaySignInBtn.addEventListener('click', signInOverlayMobile);
            } else {
                panelOverlaySignUpBtn.addEventListener('click', signUpOverlayDesktop);
                panelOverlaySignInBtn.addEventListener('click', signInOverlayDesktop);
            }
        }

        screenOverlay();
    }, []);

    const [password, setPassowrd] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState(false);

    const handleSignIn = async (e) => {
        e.preventDefault()

        if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            setError(false);
        } else {
            setError("Email inválido");
            return;
        }

        if (!password) {
            setError("Insira uma senha");
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);

        if (error) {
            setError(authErrorMessage(error));
            return;
        }

        navigate("/dashboard", { replace: true });
    }

    const [errorSignUp, setErrorSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSignUp = async (e) => {
        e.preventDefault()

        if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            setErrorSignUp(false);
        } else {
            setErrorSignUp("Email inválido");
            return;
        }

        if (password.length < 6) {
            setErrorSignUp("A senha precisa ter ao menos 6 caracteres");
            return;
        }

        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        setLoading(false);

        if (error) {
            setErrorSignUp(authErrorMessage(error));
            return;
        }

        if (!data.session) {
            setErrorSignUp("Confirme seu e-mail para entrar");
            return;
        }

        navigate("/dashboard", { replace: true });
    }

    return <>
        <Navbar />

        <div className="px-4 my-4 md:my-10 max-w-[450px] mx-auto md:max-w-[768px]" style={{ paddingBottom: keyboardSpace }}>
            <div className="bg-white rounded-lg custom-shadow h-[calc(100svh-8rem)] min-h-[536px] max-h-[700px] md:h-[700px] overflow-hidden relative flex justify-between">
                <div id="panel-white-signin" className="h-1/2 md:h-full grid place-items-center w-full md:w-1/2 absolute bg-white z-10 duration-500 ease-in-out">
                    <form noValidate onSubmit={handleSignIn} className="grid place-items-center">
                        <h1 className="font-bold text-2xl md:text-3xl text-center">Entrar</h1>

                        <input
                            type="email"
                            onFocus={scrollToInput}
                            autoComplete="email"
                            placeholder="E-mail"
                            className="bg-slate-100 mt-4 md:mt-6 w-[280px] px-4 py-2 rounded-sm outline-none"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setError(false);
                                setErrorSignUp(false);
                            }}
                        />

                        <PasswordInput
                            onFocus={scrollToInput}
                            value={password}
                            onChange={(e) => {
                                setPassowrd(e.target.value);
                                setError(false);
                                setErrorSignUp(false);
                            }}
                        />

                        <p className="text-red-500 mt-0.5">&nbsp;{error}</p>

                        <p className="mt-1">Esqueceu sua senha?</p>

                        <button type="submit" disabled={loading} className="disabled:opacity-60 bg-primary rounded-full w-[240px] mt-3 gap-2 py-3 px-6 font-semibold shadow-md shadow-gray-400 text-white flex items-center justify-center border-2 border-transparent hover:border-primary hover:bg-transparent hover:text-primary duration-300">ENTRAR</button>
                    </form>
                </div>

                <div id="overlay" className="h-1/2 md:h-full bg-primary w-full md:w-1/2 absolute translate-y-[100%] md:translate-y-[0] md:translate-x-[100%] z-40 duration-500"></div>

                <div id="panel-overlay-signup" className="h-1/2 md:h-full z-50 text-white grid place-items-center w-full md:w-1/2 absolute translate-y-[100%] md:translate-y-[0] md:translate-x-[100%] duration-500 ease-in-out">
                    <div className="grid place-items-center px-4 text-center">
                        <h1 className="font-bold text-2xl md:text-3xl text-center">Bem vindo!</h1>

                        <p className="mt-4">Ainda não tem uma conta?</p>

                        <button id="signup" type="submit" className="rounded-full w-[240px] mt-4 gap-2 py-3 px-6 font-semibold shadow-md text-white flex items-center justify-center border-2 border-white hover:bg-white hover:text-primary duration-300">CRIAR CONTA</button>
                    </div>
                </div>

                <div id="panel-overlay-signin" className="h-1/2 md:h-full z-50 text-white grid place-items-center w-full md:w-1/2 absolute translate-y-[-100%] md:translate-y-[0] md:translate-x-[-100%] duration-500 ease-in-out opacity-0">
                    <div className="grid place-items-center px-4 text-center">
                        <h1 className="font-bold text-2xl md:text-3xl text-center">Bem vindo de volta!</h1>

                        <p className="mt-4">Já tem uma conta?</p>

                        <button id="sigin" type="submit" className="rounded-full w-[240px] mt-4 gap-2 py-3 px-6 font-semibold shadow-md text-white flex items-center justify-center border-2 border-white hover:bg-white hover:text-primary duration-300">ENTRAR</button>
                    </div>
                </div>

                <div id="panel-white-signup" className="h-1/2 md:h-full grid place-items-center w-full md:w-1/2 absolute bg-white translate-y-[50%] md:translate-y-[0] md:translate-x-[50%] duration-500 ease-in-out opacity-0">
                    <form noValidate onSubmit={handleSignUp} className="grid place-items-center">
                        <h1 className="font-bold text-2xl md:text-3xl text-center">Crie uma conta</h1>

                        <input
                            type="email"
                            onFocus={scrollToInput}
                            autoComplete="email"
                            placeholder="E-mail"
                            className="input-box bg-slate-100 mt-4 md:mt-6 w-[280px] px-4 py-2 rounded-sm outline-none"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setErrorSignUp(false);
                                setError(false);
                            }}
                        />

                        <PasswordInput
                            onFocus={scrollToInput}
                            value={password}
                            onChange={(e) => {
                                setPassowrd(e.target.value);
                                setErrorSignUp(false);
                                setError(false);
                            }}
                        />

                        <p className="text-red-500 mt-0.5">&nbsp;{errorSignUp}</p>

                        <button type="submit" disabled={loading} className="disabled:opacity-60 bg-primary rounded-full w-[240px] mt-3 gap-2 py-3 px-6 font-semibold shadow-md shadow-gray-400 text-white flex items-center justify-center border-2 border-transparent hover:border-primary hover:bg-transparent hover:text-primary duration-300">CRIAR</button>
                    </form>
                </div>
            </div>
        </div>
    </>;
}

export default Login