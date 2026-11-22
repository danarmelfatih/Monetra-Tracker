import express from 'express'
import path from 'node:path'

const app = express()
const root = path.join(import.meta.dir, '..')

app.use(express.json())

// Library Supabase disajikan dari server sendiri (supaya bisa di-cache offline)
app.get('/vendor/supabase.js', (req, res) => {
  res.sendFile(
    path.join(root, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')
  )
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.get('/api/config', (req, res) => res.json({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_PUBLISHABLE_KEY
}))

app.get('/transactions', (req, res) => {
  res.sendFile(path.join(root, 'public/transactions/index.html'))
})

// Halaman statis: /login -> public/login.html
app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }))

const port = process.env.PORT || 3005
app.listen(port, () => console.log(`Berjalan di http://localhost:${port}`))