import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar/Navbar";
import { Link } from "react-router-dom";
import PasswordInput from "../../components/Input/PasswordInput";

const login = () => {

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
    }

    const [user, setUser] = useState("")
    const [errorSignUp, setErrorSignUp] = useState(false);

    const handleSignUp = async (e) => {
        e.preventDefault()

        if (!user) {
            setErrorSignUp("Insira um nome");
            return;
        }

        if (email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            setErrorSignUp(false);
        } else {
            setErrorSignUp("Email inválido");
            return;
        }

        if (!password) {
            setErrorSignUp("Insira uma senha");
            return;
        }
    }

    return <>
        <Navbar />

        <div className="px-4 my-10 max-w-[450px] mx-auto md:max-w-[768px]">
            <div className="bg-white rounded-lg custom-shadow h-[700px] overflow-hidden relative flex justify-between">
                <div id="panel-white-signin" className="h-[350px] md:h-full grid place-items-center w-full md:w-1/2 absolute bg-white z-10 duration-500 ease-in-out">
                    <form onSubmit={handleSignIn} className="grid place-items-center">
                        <h1 className="font-bold text-3xl">Entrar</h1>

                        <input
                            type="text"
                            placeholder="E-mail"
                            className="bg-slate-100 mt-6 w-[280px] px-4 py-2 rounded-sm outline-none"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setError(false);
                                setErrorSignUp(false);
                            }}
                        />

                        <PasswordInput
                            value={password}
                            onChange={(e) => {
                                setPassowrd(e.target.value);
                                setError(false);
                                setErrorSignUp(false);
                            }}
                        />

                        <p className="text-red-500 mt-0.5">&nbsp;{error}</p>

                        <p className="mt-1">Esqueceu sua senha?</p>

                        <button type="submit" className="bg-primary rounded-full w-[240px] mt-3 gap-2 py-3 px-6 font-semibold shadow-md shadow-gray-400 text-white flex items-center justify-center border-2 border-transparent hover:border-primary hover:bg-transparent hover:text-primary duration-300">ENTRAR</button>
                    </form>
                </div>

                <div id="overlay" className="h-[350px] md:h-full bg-primary w-full md:w-1/2 absolute translate-y-[100%] md:translate-y-[0] md:translate-x-[100%] z-40 duration-500"></div>

                <div id="panel-overlay-signup" className="h-[350px] md:h-full z-50 text-white grid place-items-center w-full md:w-1/2 absolute translate-y-[100%] md:translate-y-[0] md:translate-x-[100%] duration-500 ease-in-out">
                    <div className="grid place-items-center">
                        <h1 className="font-bold text-3xl">Bem vindo!</h1>

                        <p className="mt-4">Ainda não tem uma conta?</p>

                        <button id="signup" type="submit" className="rounded-full w-[240px] mt-4 gap-2 py-3 px-6 font-semibold shadow-md text-white flex items-center justify-center border-2 border-white hover:bg-white hover:text-primary duration-300">CRIAR CONTA</button>
                    </div>
                </div>

                <div id="panel-overlay-signin" className="h-[350px] md:h-full z-50 text-white grid place-items-center w-full md:w-1/2 absolute translate-y-[-100%] md:translate-y-[0] md:translate-x-[-100%] duration-500 ease-in-out opacity-0">
                    <div className="grid place-items-center">
                        <h1 className="font-bold text-3xl">Bem vindo de volta!</h1>

                        <p className="mt-4">Já tem uma conta?</p>

                        <button id="sigin" type="submit" className="rounded-full w-[240px] mt-4 gap-2 py-3 px-6 font-semibold shadow-md text-white flex items-center justify-center border-2 border-white hover:bg-white hover:text-primary duration-300">ENTRAR</button>
                    </div>
                </div>

                <div id="panel-white-signup" className="h-[350px] md:h-full grid place-items-center w-full md:w-1/2 absolute bg-white translate-y-[50%] md:translate-y-[0] md:translate-x-[50%] duration-500 ease-in-out opacity-0">
                    <form onSubmit={handleSignUp} className="grid place-items-center">
                        <h1 className="font-bold text-3xl">Crie uma conta</h1>

                        <input
                            type="text"
                            placeholder="Usuário"
                            className="input-box bg-slate-100 mt-6 w-[280px] px-4 py-2 rounded-sm"
                            value={user}
                            onChange={(e) => {
                                setUser(e.target.value);
                                setErrorSignUp(false);
                            }}
                        />

                        <input
                            type="text"
                            placeholder="E-mail"
                            className="input-box bg-slate-100 mt-3 w-[280px] px-4 py-2 rounded-sm outline-none"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setErrorSignUp(false);
                                setError(false);
                            }}
                        />

                        <PasswordInput
                            value={password}
                            onChange={(e) => {
                                setPassowrd(e.target.value);
                                setErrorSignUp(false);
                                setError(false);
                            }}
                        />

                        <p className="text-red-500 mt-0.5">&nbsp;{errorSignUp}</p>

                        <button type="submit" className="bg-primary rounded-full w-[240px] mt-3 gap-2 py-3 px-6 font-semibold shadow-md shadow-gray-400 text-white flex items-center justify-center border-2 border-transparent hover:border-primary hover:bg-transparent hover:text-primary duration-300">CRIAR</button>
                    </form>
                </div>
            </div>
        </div>
    </>;
}

export default login