require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "troque-esta-senha";
const SESSION_SECRET = process.env.SESSION_SECRET || "desenvolvimento-nao-publicar";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && (ADMIN_PASSWORD === "troque-esta-senha" || SESSION_SECRET === "desenvolvimento-nao-publicar")) {
  throw new Error("Configure ADMIN_PASSWORD e SESSION_SECRET fortes antes de executar em produção.");
}
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "assina-paciente.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  patient_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  service TEXT NOT NULL,
  price TEXT NOT NULL,
  terms TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendente',
  created_at TEXT NOT NULL,
  signed_at TEXT,
  signer_name TEXT,
  signature_data TEXT,
  accepted_text TEXT,
  signer_ip TEXT,
  user_agent TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(contract_id) REFERENCES contracts(id)
);
`);
const insertAudit = db.prepare("INSERT INTO audit (contract_id,event,details,created_at) VALUES (?,?,?,?)");
const now = () => new Date().toISOString();
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const page = (title, body, extraHead = "") => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
${extraHead}<style>
:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#202124;background:#f4f5f7}
*{box-sizing:border-box}body{margin:0}header{background:#151515;color:#fff;padding:18px 24px}
header strong{font-size:18px;letter-spacing:.3px}.wrap{max-width:1080px;margin:28px auto;padding:0 18px}
.card{background:white;border:1px solid #e2e4e8;border-radius:14px;padding:22px;margin:0 0 18px;box-shadow:0 4px 16px #1111}
h1{font-size:25px;margin:0 0 8px}h2{font-size:18px;margin:0 0 14px}p{line-height:1.55}
label{display:block;font-size:13px;font-weight:650;margin:13px 0 6px}
input,select,textarea{font:inherit;width:100%;padding:11px 12px;border:1px solid #cdd1d8;border-radius:8px;background:white}
textarea{min-height:150px;resize:vertical}button,.button{border:0;border-radius:8px;padding:11px 15px;font:inherit;font-weight:700;cursor:pointer;display:inline-block;text-decoration:none}
.primary{background:#151515;color:#fff}.secondary{background:#e9ebef;color:#222}.success{background:#177245;color:white}
.danger{background:#a82020;color:white}.muted{color:#60656f;font-size:13px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px}th,td{text-align:left;padding:12px;border-bottom:1px solid #e8e9ed;font-size:14px}
.badge{border-radius:20px;padding:4px 9px;font-size:12px;font-weight:700;background:#fff1cc;color:#765400}.badge.signed{background:#d9f3e5;color:#155b39}
.contract{white-space:pre-wrap;line-height:1.65;border:1px solid #e0e2e6;border-radius:8px;padding:18px;background:#fff}
.signature{width:100%;height:190px;border:1px dashed #969ba5;border-radius:8px;touch-action:none;background:#fff}
.notice{padding:12px 14px;background:#fff7dc;border-radius:8px;font-size:13px;line-height:1.5}
@media(max-width:700px){.grid{grid-template-columns:1fr}.wrap{margin:18px auto}.card{padding:17px}header{padding:16px}}
@media print{header,.no-print,button,.button{display:none!important}body{background:white}.wrap{max-width:none;margin:0;padding:0}.card{border:0;box-shadow:none}}
</style></head><body><header><strong>AssinaPaciente</strong></header><main class="wrap">${body}</main></body></html>`;
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(session({
  name: "assina.sid", secret: SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use((req,res,next) => { res.set("Cache-Control","no-store"); next(); });

function requireAuth(req,res,next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect("/login");
}
function audit(contractId,event,details="") { insertAudit.run(contractId,event,details,now()); }
function contractLink(token) { return `${BASE_URL}/assinar/${token}`; }
function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }

app.get("/", (req,res) => res.redirect(req.session?.authenticated ? "/painel" : "/login"));
app.get("/login", (req,res) => {
  const error = req.query.erro ? '<p class="notice">Usuário ou senha incorretos.</p>' : "";
  res.send(page("Entrar — AssinaPaciente", `<section class="card" style="max-width:460px;margin:5vh auto">
<h1>Acesso da clínica</h1><p class="muted">Entre para criar e acompanhar contratos.</p>${error}
<form method="post" action="/login"><label>Usuário</label><input name="username" autocomplete="username" required>
<label>Senha</label><input name="password" type="password" autocomplete="current-password" required>
<div class="actions"><button class="primary" type="submit">Entrar</button></div></form>
<p class="muted">Acesso administrativo. Não compartilhe sua senha.</p></section>`));
});
app.post("/login", (req, res) => {
  const receivedUser = String(req.body.username || "").trim();
  const receivedPass = String(req.body.password || "");

  const userOk = receivedUser === ADMIN_USER;
  const passOk = receivedPass === ADMIN_PASSWORD;

  console.log("Diagnóstico de login:", {
    usernameMatches: userOk,
    passwordMatches: passOk,
    usernameLength: receivedUser.length,
    passwordLength: receivedPass.length,
    adminUserConfigured: Boolean(process.env.ADMIN_USER),
    adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD)
  });

  if (!userOk || !passOk) {
    return res.redirect("/login?erro=1");
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error("Erro ao criar sessão:", err.message);
      return res.status(500).send(
        "Não foi possível iniciar a sessão. Tente novamente."
      );
    }

    req.session.authenticated = true;

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error("Erro ao salvar sessão:", saveErr.message);
        return res.status(500).send(
          "Não foi possível salvar a sessão. Tente novamente."
        );
      }

      return res.redirect("/painel");
    });
  });
});
app.get("/painel", requireAuth, (req,res) => {
  const rows = db.prepare("SELECT id,patient_name,whatsapp,service,price,status,created_at,signed_at FROM contracts ORDER BY id DESC LIMIT 250").all();
  const bodyRows = rows.map(c => `<tr><td>#${c.id}</td><td>${escapeHtml(c.patient_name)}</td><td>${escapeHtml(c.service)}</td><td>${escapeHtml(c.price)}</td><td><span class="badge ${c.status==="Assinado"?"signed":""}">${escapeHtml(c.status)}</span></td><td>${new Date(c.created_at).toLocaleString("pt-BR")}</td><td><a href="/contratos/${c.id}">Abrir</a></td></tr>`).join("");
  res.send(page("Painel — AssinaPaciente", `<div class="actions no-print" style="justify-content:space-between;margin:0 0 18px">
<div><h1>Contratos</h1><p class="muted">Crie um contrato e envie o link individual pelo WhatsApp.</p></div>
<form method="post" action="/logout"><button class="secondary">Sair</button></form></div>
<section class="card no-print"><h2>Novo contrato</h2>
<form method="post" action="/contratos">
<div class="grid"><div><label>Nome da clínica/instituição</label><input name="clinic_name" value="Instituto Méstris" required maxlength="160"></div>
<div><label>Nome completo do paciente</label><input name="patient_name" required maxlength="160"></div>
<div><label>WhatsApp do paciente (com DDD)</label><input name="whatsapp" placeholder="5519999999999" required maxlength="24"></div>
<div><label>Tipo de contrato</label><select name="contract_type"><option>Procedimento odontológico</option><option>Tratamento estético</option><option>Curso / matrícula</option><option>Outro</option></select></div>
<div><label>Serviço/procedimento/curso</label><input name="service" required maxlength="240"></div>
<div><label>Valor (ex.: R$ 1.500,00)</label><input name="price" required maxlength="80"></div></div>
<label>Cláusulas e condições</label><textarea name="terms" required maxlength="20000" placeholder="Descreva o objeto, condições de pagamento, cancelamento, responsabilidades e demais cláusulas..."></textarea>
<p class="muted">Inclua apenas os dados necessários. Revise o conteúdo antes de enviar ao paciente.</p>
<div class="actions"><button class="primary" type="submit">Criar contrato e gerar link</button></div></form></section>
<section class="card"><h2>Contratos recentes</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>Paciente</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Criado em</th><th></th></tr></thead><tbody>${bodyRows || '<tr><td colspan="7">Nenhum contrato cadastrado.</td></tr>'}</tbody></table></div></section>`));
});

app.post("/contratos", requireAuth, (req,res) => {
  const fields = ["clinic_name","patient_name","whatsapp","contract_type","service","price","terms"];
  for (const f of fields) if (!String(req.body[f] || "").trim()) return res.status(400).send("Preencha todos os campos obrigatórios.");
  const whatsapp = normalizePhone(req.body.whatsapp);
  if (whatsapp.length < 10 || whatsapp.length > 15) return res.status(400).send("Informe um WhatsApp válido com DDD e código do país, quando necessário.");
  const token = crypto.randomBytes(32).toString("base64url");
  const result = db.prepare(`INSERT INTO contracts (token_hash,patient_name,whatsapp,clinic_name,contract_type,service,price,terms,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(sha256(token),String(req.body.patient_name).trim(),whatsapp,String(req.body.clinic_name).trim(),String(req.body.contract_type).trim(),String(req.body.service).trim(),String(req.body.price).trim(),String(req.body.terms).trim(),now());
  audit(result.lastInsertRowid,"Contrato criado");
  res.redirect(`/contratos/${result.lastInsertRowid}?novo=1&token=${encodeURIComponent(token)}`);
});

app.get("/contratos/:id", requireAuth, (req,res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE id=?").get(Number(req.params.id));
  if (!c) return res.status(404).send("Contrato não encontrado.");
  const auditRows = db.prepare("SELECT event,details,created_at FROM audit WHERE contract_id=? ORDER BY id DESC").all(c.id);
  const link = req.query.token ? contractLink(req.query.token) : "";
  const whatsappText = `Olá, ${c.patient_name}! Segue o link para leitura e assinatura do seu contrato: ${link || "[link individual já gerado; copie-o no painel quando disponível]"}`;
  const waLink = link ? `https://wa.me/${c.whatsapp}?text=${encodeURIComponent(whatsappText)}` : "";
  const history = auditRows.map(a => `<li>${escapeHtml(a.event)} — ${new Date(a.created_at).toLocaleString("pt-BR")} ${escapeHtml(a.details || "")}</li>`).join("");
  res.send(page(`Contrato #${c.id}`, `<div class="actions no-print"><a class="button secondary" href="/painel">← Voltar</a><button class="secondary" onclick="window.print()">Imprimir / salvar PDF</button></div>
<section class="card"><h1>Contrato #${c.id}</h1><p><span class="badge ${c.status==="Assinado"?"signed":""}">${escapeHtml(c.status)}</span></p>
<div class="grid"><p><b>Paciente:</b><br>${escapeHtml(c.patient_name)}</p><p><b>WhatsApp:</b><br>${escapeHtml(c.whatsapp)}</p><p><b>Serviço:</b><br>${escapeHtml(c.service)}</p><p><b>Valor:</b><br>${escapeHtml(c.price)}</p></div>
<h2>Contrato</h2><div class="contract">${escapeHtml(`${c.clinic_name}\n\nTipo: ${c.contract_type}\nPaciente: ${c.patient_name}\nServiço: ${c.service}\nValor: ${c.price}\n\nCLÁUSULAS E CONDIÇÕES\n\n${c.terms}`)}</div>
${c.status==="Assinado" ? `<h2 style="margin-top:20px">Registro de assinatura</h2><p>Assinado por: <b>${escapeHtml(c.signer_name)}</b><br>Data/hora: ${escapeHtml(c.signed_at)}<br>Confirmação: ${escapeHtml(c.accepted_text)}</p><img alt="Assinatura do paciente" style="max-width:100%;border:1px solid #ddd" src="${c.signature_data}">` : ""}
${link ? `<div class="no-print" style="margin-top:22px"><h2>Enviar para o paciente</h2><p class="muted">O link individual é exibido apenas nesta tela logo após a criação. Copie e guarde com segurança.</p><input id="contractLink" readonly value="${escapeHtml(link)}"><div class="actions"><button class="primary" onclick="navigator.clipboard.writeText(document.getElementById('contractLink').value).then(()=>alert('Link copiado'))">Copiar link</button><a class="button success" target="_blank" rel="noopener" href="${waLink}">Enviar pelo WhatsApp</a></div></div>` : `<p class="notice no-print">Por segurança, o link completo não é armazenado em texto puro e não pode ser recuperado. Gere um novo contrato se precisar emitir outro link, ou implemente uma função de reemissão antes de usar em produção.</p>`}
<h2 style="margin-top:24px">Histórico de eventos</h2><ul>${history}</ul></section>`));
});

app.get("/assinar/:token", (req,res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE token_hash=?").get(sha256(req.params.token));
  if (!c) return res.status(404).send(page("Link inválido",'<section class="card"><h1>Link inválido ou indisponível</h1><p>Peça à clínica que confira o link enviado.</p></section>'));
  audit(c.id,"Link de assinatura acessado");
  if (c.status === "Assinado") return res.send(page("Contrato assinado", `<section class="card"><h1>Contrato já assinado</h1><p>Este contrato foi assinado em ${escapeHtml(c.signed_at)}.</p><p>Se precisar de uma cópia, entre em contato com a clínica.</p></section>`));
  const contractText = `${c.clinic_name}\n\nCONTRATO — ${c.contract_type}\n\nPaciente: ${c.patient_name}\nServiço: ${c.service}\nValor: ${c.price}\n\nCLÁUSULAS E CONDIÇÕES\n\n${c.terms}`;
  res.send(page("Assinar contrato", `<section class="card"><h1>Leia seu contrato</h1><p class="muted">Confira todos os dados e condições antes de assinar.</p><div class="contract">${escapeHtml(contractText)}</div>
<form id="signForm" method="post" action="/assinar/${encodeURIComponent(req.params.token)}">
<label>Nome completo de quem está assinando</label><input name="signer_name" required maxlength="160" value="${escapeHtml(c.patient_name)}">
<label>Assinatura (desenhe com o dedo ou mouse)</label><canvas id="signature" class="signature" aria-label="Área para desenhar a assinatura"></canvas>
<div class="actions"><button class="secondary" type="button" id="clear">Limpar assinatura</button></div>
<input type="hidden" name="signature_data" id="signature_data">
<label style="display:flex;gap:10px;align-items:flex-start;font-weight:500"><input style="width:auto;margin-top:4px" type="checkbox" name="accepted" value="yes" required>
<span>Declaro que li e compreendi o contrato acima, que concordo com suas cláusulas e que estou assinando eletronicamente por minha livre vontade.</span></label>
<div class="notice">Ao enviar, a clínica registrará a data e hora, o endereço IP e informações técnicas do navegador para auditoria. Use apenas se você concorda com o contrato.</div>
<div class="actions"><button class="primary" type="submit">Confirmar e assinar</button></div></form></section>
<script>
(()=>{const canvas=document.getElementById('signature'),ctx=canvas.getContext('2d');let drawing=false,drawn=false;
function resize(){const ratio=window.devicePixelRatio||1;const rect=canvas.getBoundingClientRect();const old=drawn?canvas.toDataURL():null;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';if(old){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,rect.width,rect.height);img.src=old;}}
resize();window.addEventListener('resize',resize);
function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
canvas.addEventListener('pointerdown',e=>{drawing=true;drawn=true;canvas.setPointerCapture(e.pointerId);const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()});
for(const ev of ['pointerup','pointercancel','pointerleave'])canvas.addEventListener(ev,()=>drawing=false);
document.getElementById('clear').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);drawn=false};
document.getElementById('signForm').addEventListener('submit',e=>{if(!drawn){e.preventDefault();alert('Desenhe sua assinatura antes de confirmar.');return}document.getElementById('signature_data').value=canvas.toDataURL('image/png')});
})();
</script>`));
});

app.post("/assinar/:token", (req,res) => {
  const c = db.prepare("SELECT * FROM contracts WHERE token_hash=?").get(sha256(req.params.token));
  if (!c) return res.status(404).send("Link inválido.");
  if (c.status === "Assinado") return res.status(409).send("Este contrato já foi assinado.");
  const signer = String(req.body.signer_name || "").trim();
  const signature = String(req.body.signature_data || "");
  if (!signer || req.body.accepted !== "yes" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 500000) {
    return res.status(400).send("Confira o nome, marque o aceite e desenhe a assinatura.");
  }
  const acceptedText = "Li, compreendi e concordo com as cláusulas do contrato e confirmo minha assinatura eletrônica.";
  const result = db.prepare(`UPDATE contracts SET status='Assinado',signed_at=?,signer_name=?,signature_data=?,accepted_text=?,signer_ip=?,user_agent=?
    WHERE id=? AND status='Pendente'`).run(now(),signer,signature,acceptedText,String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").slice(0,200),String(req.headers["user-agent"] || "").slice(0,500),c.id);
  if (result.changes) audit(c.id,"Contrato assinado",`Assinante: ${signer}`);
  res.send(page("Assinatura registrada", `<section class="card"><h1>Assinatura registrada</h1><p>Obrigado, ${escapeHtml(signer)}. Sua assinatura e o aceite foram registrados.</p><p>Data e hora: ${escapeHtml(db.prepare("SELECT signed_at FROM contracts WHERE id=?").get(c.id).signed_at)}</p><p>Guarde o contato da clínica caso precise solicitar uma cópia do contrato.</p></section>`));
});

app.use((err,req,res,next) => {
  console.error(err);
  res.status(500).send(page("Erro",'<section class="card"><h1>Não foi possível concluir</h1><p>Tente novamente. Se o problema continuar, entre em contato com o administrador.</p></section>'));
});
app.listen(PORT, () => console.log(`AssinaPaciente rodando em ${BASE_URL}`));
