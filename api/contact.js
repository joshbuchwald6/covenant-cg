const { Resend } = require('resend')

const LIMITS = {
  name: 200,
  company: 200,
  email: 320,
  phone: 50,
  details: 10000
}

const SERVICES = new Set([
  'general-contracting',
  'planning-design',
  'value-engineering',
  'project-management',
  'conceptual-estimating',
  'other'
])

const SERVICE_LABEL = {
  'general-contracting': 'General Contracting',
  'planning-design': 'Planning & Design',
  'value-engineering': 'Value Engineering',
  'project-management': 'Project Management',
  'conceptual-estimating': 'Conceptual Estimating',
  other: 'Other / Not sure yet'
}

function escapeHtml (text) {
  const s = String(text)
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[ch]))
}

function oneLine (s) {
  return String(s).replace(/[\r\n]+/g, ' ').trim()
}

function parseBody (req) {
  const raw = req.body
  if (raw == null) return {}
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return null
    }
  }
  return {}
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'Email is not configured (missing RESEND_API_KEY).'
    })
  }

  const body = parseBody(req)
  if (body === null) {
    return res.status(400).json({ ok: false, error: 'Invalid request body.' })
  }

  const name = oneLine(body.name || '')
  const email = oneLine(body.email || '')
  const company = oneLine(body.company || '')
  const phone = oneLine(body.phone || '')
  const service = String(body.service || '').trim()
  const details = String(body.details || '').trim()

  if (!name || name.length > LIMITS.name) {
    return res.status(400).json({ ok: false, error: 'Please enter your name.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > LIMITS.email) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email.' })
  }
  if (!SERVICES.has(service)) {
    return res.status(400).json({ ok: false, error: 'Please select a service.' })
  }
  if (details.length > LIMITS.details) {
    return res.status(400).json({ ok: false, error: 'Invalid input.' })
  }
  if (company.length > LIMITS.company || phone.length > LIMITS.phone) {
    return res.status(400).json({ ok: false, error: 'Invalid input.' })
  }

  const to = process.env.CONTACT_TO_EMAIL || 'devin@covenant-cg.com'
  const from =
    process.env.CONTACT_FROM ||
    'Covenant Website <onboarding@resend.dev>'

  const serviceLabel = SERVICE_LABEL[service] || service
  const subject = `Website inquiry: ${oneLine(name).slice(0, 120)} — ${serviceLabel}`

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
  <h2 style="margin-top:0;">New project inquiry</h2>
  <table style="border-collapse:collapse;max-width:560px;">
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Name</td><td>${escapeHtml(name)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Company</td><td>${company ? escapeHtml(company) : '—'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;">Phone</td><td>${phone ? escapeHtml(phone) : '—'}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">Service</td><td>${escapeHtml(serviceLabel)}</td></tr>
  </table>
  <h3 style="margin:20px 0 8px;">Project details</h3>
  <p style="white-space:pre-wrap;margin:0;">${details ? escapeHtml(details) : '—'}</p>
</body></html>`

  const text = [
    'New project inquiry — Covenant Construction website',
    '',
    `Name: ${name}`,
    `Company: ${company || '—'}`,
    `Email: ${email}`,
    `Phone: ${phone || '—'}`,
    `Service: ${serviceLabel}`,
    '',
    'Project details:',
    details || '—'
  ].join('\n')

  const resend = new Resend(apiKey)

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject,
      html,
      text
    })

    if (error) {
      console.error('Resend error:', error)
      return res.status(502).json({
        ok: false,
        error:
          'Could not send your message. Please try again or email us directly.'
      })
    }

    return res.status(200).json({ ok: true, id: data?.id })
  } catch (err) {
    console.error('Contact API error:', err)
    return res.status(502).json({
      ok: false,
      error:
        'Could not send your message. Please try again or email us directly.'
    })
  }
}
