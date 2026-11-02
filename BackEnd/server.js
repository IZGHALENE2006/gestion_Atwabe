    import express from 'express'
    import dotenv from 'dotenv'
    import ConnectDB from './config/db.js'
    import app from './app.js'
    dotenv.config()
    ConnectDB()

    const PORT = process.env.PORT || 5000

    app.listen(PORT,()=>{
        console.log(`Server running on port ${PORT}`)
        
    })
