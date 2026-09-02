const details: Record<string, { title: string; eyebrow: string; color: string }> = {
  'User profile': { title: 'Your career profile is ready', eyebrow: 'PROFILE COMPLETE', color: '#14b8a6' },
  'Test payment': { title: 'Test activation deposit verified', eyebrow: 'PAYMENT TEST COMPLETE', color: '#f59e0b' },
  'Payment activation': { title: 'Congratulations, your activation is verified', eyebrow: 'PAYMENT VERIFIED', color: '#f59e0b' },
  'Search workflow': { title: 'Your guided search plan is saved', eyebrow: 'SEARCH PLAN READY', color: '#38bdf8' },
  'Application preferences': { title: 'Your application rules are ready', eyebrow: 'REVIEW RULES SAVED', color: '#a78bfa' },
  'Guided setup': { title: 'Welcome to your Career Assistant', eyebrow: 'SETUP COMPLETE', color: '#14b8a6' },
  'Job search run': { title: 'Your latest job-search report', eyebrow: 'SEARCH RUN COMPLETE', color: '#38bdf8' },
  'Search paused': { title: 'Your career search is paused', eyebrow: 'SEARCH PAUSED', color: '#f59e0b' },
  'Search resumed': { title: 'Your career search is active', eyebrow: 'SEARCH ACTIVE', color: '#14b8a6' },
  'Application submitted': { title: 'Application recorded', eyebrow: 'APPLICATION UPDATE', color: '#14b8a6' },
  'Email test': { title: 'Your email is working', eyebrow: 'EMAIL CONNECTED', color: '#14b8a6' },
}

export function createStepEmail(name: string, step: string, message: string, brand = 'SkillBridge') {
  const template = details[step] ?? { title: `${step} completed`, eyebrow: 'PROGRESS SAVED', color: '#14b8a6' }
  const plainMessage = message.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
  const text = `Hi ${name || 'there'},\n\n${template.title}\n\n${plainMessage}\n\nYour progress is securely saved in ${brand}.\n\n— ${brand}`
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 35px rgba(15,23,42,.08)"><tr><td style="padding:30px;background:#101a2e;color:#fff"><div style="font-size:22px;font-weight:800">${brand}</div></td></tr><tr><td style="padding:34px"><div style="color:${template.color};font-size:11px;font-weight:800;letter-spacing:1.5px">${template.eyebrow}</div><h1 style="margin:9px 0 16px;font-size:28px;line-height:1.2">${template.title}</h1><p style="font-size:16px">Hi ${name || 'there'},</p><div style="margin:22px 0;padding:18px;border-left:4px solid ${template.color};border-radius:8px;background:#f7fafc;line-height:1.65">${message}</div><p style="color:#64748b;line-height:1.6">Your progress is securely saved. Open ${brand} whenever you are ready for the next step.</p></td></tr></table></td></tr></table></body></html>`
  return { subject: `${brand} · ${template.title}`, text, html }
}
