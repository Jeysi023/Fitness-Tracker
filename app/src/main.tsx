import { createRoot } from "react-dom/client"
import { registerSW } from "virtual:pwa-register"
import "./index.css"
import DailyReps from "./App"

/* Follow the phone's light or dark setting. */
function applyTheme() {
  let dark = false
  try { dark = window.matchMedia("(prefers-color-scheme: dark)").matches } catch { dark = false }
  document.documentElement.classList.toggle("dark", dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", dark ? "#000000" : "#f2f2f7")
}
applyTheme()
try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme) } catch { /* old browsers */ }

createRoot(document.getElementById("root")!).render(<DailyReps />)

/* Cache the app on the phone so it opens offline; new versions install in the background. */
registerSW({ immediate: true })
