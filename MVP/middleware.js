const express = require('express')
const app = express()

const doggy = (req, res, next) => {
    req.propValue = "doggy"
    console.log(req.propValue)
    next()
}

const horse = (req, res, next) => {
    req.propValue += "horse"
    console.log(req.propValue)
    next()
}

app.get('/', doggy, horse, (req, res) => {
    res.send(`<h1>My value is: ${req.propValue}</h1>`)
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Middleware app is running on port ${port}`))