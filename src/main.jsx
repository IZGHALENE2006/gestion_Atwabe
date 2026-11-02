import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { Store } from './app/stor.jsx'
import { Provider } from 'react-redux'
import './index.css'
import './i18n'
import { BrowserRouter } from 'react-router-dom'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={Store}>

       <BrowserRouter>
        <App/>
      </BrowserRouter>
    </Provider>
  
  </StrictMode>,
)
