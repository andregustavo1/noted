import React from "react";
import { BrowserRouter as Router, Routes, Route} from "react-router-dom"
import Home from "./pages/Home/Home";
import Login from "./pages/Login/Login"

const routes = (
    <Router>
        <Routes>
            <Route path="/dashboard" exact element={<Home />} />
            <Route path="/login" exact element={<Login />} />
        </Routes>
    </Router>
)

const App = () => {
    return (
        <div>{routes}</div>
    )
}

export default App