

import Sidebar from "./NavBar/Navbar"
import { Outlet } from "react-router"
function Home(){
    return(
            <div className="h-screen">

                <Sidebar />

                    <div className="ms-20">
                  
               <Outlet />
                      

                    </div>
            
            </div>
    )

}
export default Home
