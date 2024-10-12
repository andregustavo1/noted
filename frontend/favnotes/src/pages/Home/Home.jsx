import React, { useState } from "react";
import Navbar from "../../components/Navbar/Navbar";
import NoteCard from "../../components/Cards/NoteCard";
import { TfiPlus } from "react-icons/tfi";
import CategoryBar from "../../components/Cards/CategoryBar";
import ProfileInfo from "../../components/Cards/ProfileInfo";
import ProfileConfig from "../../components/Cards/ProfileConfig.jsx";
import { useNavigate } from "react-router-dom"

const Home = () => {

    const [onConfig, setOnConfig] = useState(false)

    const toggleConfig = () => {
        setOnConfig(!onConfig)
    }

    const navigate = useNavigate;

    const onLogout = () => {
        navigate("/login");
    };

    return (
        <>
            <div className="max-w-[1280px] relative mx-auto">
                <Navbar />

                <div className={`absolute top-0 py-6 pr-4 pl-2 z-50 duration-300 delay-[10ms] ${onConfig ? "right-[186px] ease-in-out " : "right-0 ease-out"}`}>
                    <ProfileInfo onConfigClick={toggleConfig}></ProfileInfo>
                </div>
            </div>

            <div className="flex gap-2 px-4 max-w-[768px] mx-auto">
                <CategoryBar
                    title={"Todas"}
                    quantity={20}
                />

                <CategoryBar
                    title={"Objetivos"}
                    quantity={20}
                />
            </div>


            <div onClick={toggleConfig} className={`bg-black w-screen h-screen absolute top-0 z-30 duration-300 ${onConfig ? "opacity-20 visible" : "opacity-0 invisible"}`}></div>

            <div id="container" className={`flex flex-wrap justify-between mb-20 mt-4 px-4 gap-2 max-w-[768px] mx-auto relative `}>
                <NoteCard
                    title="Objetivo 1"
                    date="27/09/2024"
                    content="Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."
                    category={"Pessoal"}
                    isPinned={false}
                    onEdit={() => { }}
                    onDelete={() => { }}
                    onPinNote={() => { }}
                ></NoteCard>

                <NoteCard
                    title="Objetivo 1"
                    date="27/09/2024"
                    content="Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."
                    category={"Pessoal"}
                    isPinned={false}
                    onEdit={() => { }}
                    onDelete={() => { }}
                    onPinNote={() => { }}
                ></NoteCard>

                <NoteCard
                    title="Objetivo 1"
                    date="27/09/2024"
                    content="Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."
                    category={"Pessoal"}
                    isPinned={false}
                    onEdit={() => { }}
                    onDelete={() => { }}
                    onPinNote={() => { }}
                ></NoteCard>

                <NoteCard
                    title="Objetivo 1"
                    date="27/09/2024"
                    content="Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum."
                    category={"Pessoal"}
                    isPinned={false}
                    onEdit={() => { }}
                    onDelete={() => { }}
                    onPinNote={() => { }}
                ></NoteCard>
            </div>

            <div className={`absolute overflow-hidden w-full h-full top-0 right-0 duration-300 ${onConfig ? "visible" : "invisible"}`}>
                <div className={`absolute top-0 right-0 h-full overflow-hidden duration-300 transform z-40 ${onConfig ? "translate-x-0 ease-in-out" : "translate-x-full ease-linear"}`}>
                    <ProfileConfig onLogout={onLogout} />
                </div>
            </div>


            <button
                className='w-14 h-14 bg-lime-300 text-xl grid place-items-center text-center rounded-full fixed bottom-10 hover:scale-105 hover:brightness-95 duration-300 left-1/2 transform -translate-x-1/2 shadow-sm'
                onClick={() => { }}>

                <TfiPlus />
            </button>
        </>
    )
}

export default Home