import { Suspense } from "react";
import Experience from "./components/Experience";
import "./App.css";

function App() {
  return (
    <Suspense fallback={<div style={{ width: "100vw", height: "100vh", background: "#ffffff" }} />}>
      <Experience />
    </Suspense>
  );
}

export default App;
