const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(envPath)) {
    return
  }
  const content = fs.readFileSync(envPath, "utf8")
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) return
    const key = match[1]
    const value = match[2]
    if (!process.env[key]) {
      process.env[key] = value
    }
  })
}

async function ensureAdmin() {
  loadEnvFile()

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
    process.exit(1)
  }

  const email = process.env.ADMIN_EMAIL || "admin@local.test"
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!"
  const fullName = process.env.ADMIN_NAME || "Super Admin"

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 200,
  })

  if (listError) {
    console.error("Failed to list users:", listError.message)
    process.exit(1)
  }

  const existing = listData?.users?.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  )

  let user = existing

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error) {
      console.error("Failed to create user:", error.message)
      process.exit(1)
    }

    user = data.user
  }

  if (!user) {
    console.error("Unable to resolve admin user.")
    process.exit(1)
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      email,
      full_name: fullName,
      role: "admin",
    })

  if (profileError) {
    console.error("Failed to set admin role:", profileError.message)
    process.exit(1)
  }

  console.log("Super admin ready:")
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}`)
}

ensureAdmin().catch((error) => {
  console.error(error)
  process.exit(1)
})
