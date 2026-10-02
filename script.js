/* =====================================================================
   TROCA DE ESCALA — script.js
   Toda a lógica da aplicação. Partes:
     1. Configuração              5. Interface (peças reutilizáveis)
     2. Utilitários               6. Telas
     3. Banco de dados            7. Início (escolhe a tela)
     4. PDF do formulário
   ===================================================================== */
"use strict";

/* =====================================================================
   1. CONFIGURAÇÃO
   Dados do projeto Firebase (já preenchidos: projeto "insumo-pro").
   Para trocar de projeto, substitua o bloco abaixo pelo "const firebaseConfig = { ... };" que o Firebase
   mostra em Configurações do projeto > Seus apps > App da Web (sem as linhas "import" e "initializeApp").
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAtoVPTGvwmQ-wOnKuKVFFKHkTwV43tGZI",
  authDomain: "insumo-pro.firebaseapp.com",
  projectId: "insumo-pro",
  storageBucket: "insumo-pro.firebasestorage.app",
  messagingSenderId: "334371369968",
  appId: "1:334371369968:web:a4215ae8b6f17eb61c6335",
  measurementId: "G-QMD87RLG13"
};

// A matrícula vira o login: 4201 -> 4201@colaboradores.troca-escala.app (o domínio não precisa existir).
// Não altere depois de cadastrar usuários.
const DOMINIO_LOGIN = "colaboradores.troca-escala.app";

const EMPRESAS = ["BIANCOGRES", "LM COMÉRCIO"];

// Redefinição de senha pelo gestor/RH. Precisa da função "redefinirSenha" publicada
// (pasta funcao-redefinir-senha). Deixe false enquanto ela não estiver no ar.
const USAR_REDEFINICAO = false;
const REGIAO_FUNCOES = "southamerica-east1";
const MODELO_PDF = "modelo-un-fo-spe-023.pdf";

/* ---------- Conexão com o Firebase ---------- */
// Aberto com duplo clique (file://)? O login do Firebase só funciona num endereço http(s).
const abertoComoArquivo = location.protocol === "file:";
const firebaseCarregado = typeof firebase !== "undefined";
const configurado = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
const pronto = configurado && firebaseCarregado && !abertoComoArquivo;
const auth = pronto ? (firebase.initializeApp(firebaseConfig), firebase.auth()) : null;
const db = pronto ? firebase.firestore() : null;

// Cache no próprio aparelho: o Firebase guarda o que já baixou e, nas próximas vezes,
// só traz o que mudou. Economiza dados e deixa o app mais rápido.
if (db && db.enablePersistence) db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
const agora = () => firebase.firestore.FieldValue.serverTimestamp();


/* =====================================================================
   2. UTILITÁRIOS
   ===================================================================== */
const ETAPAS = {
  aguardando_parceiro: { rotulo: "Aguardando colega", tom: "espera" },
  aguardando_gestor: { rotulo: "Aguardando gestor", tom: "espera" },
  aprovada: { rotulo: "Aprovada", tom: "info" },
  concluida: { rotulo: "Concluída", tom: "ok" },
  recusada: { rotulo: "Recusada", tom: "erro" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
  expirada: { rotulo: "Prazo vencido", tom: "erro" },
  pendente: { rotulo: "Pendente", tom: "espera" },
};
const PAPEIS = { colaborador: "Colaborador", gestor: "Gestor", admin: "RH / Administrador" };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function emailDaMatricula(matricula) {
  return String(matricula || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "") + "@" + DOMINIO_LOGIN;
}

/** "2026-10-01" -> "01/10/2026" (ou "01/10/26" se curta) */
function dataBR(iso, curta) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${curta ? a.slice(2) : a}`;
}
function diaSemana(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS[new Date(a, m - 1, d).getDay()];
}
function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
/** "6h" + "18h" -> "06H AS 18H" */
function horarioDe(entrada, saida) {
  const f = (v) => {
    const t = String(v || "").trim().toUpperCase().replace(/\s+/g, "");
    const m = t.match(/^(\d{1,2})(?:H|:)?(\d{2})?H?$/);
    if (!m) return t;
    return m[1].padStart(2, "0") + "H" + (m[2] && m[2] !== "00" ? m[2] : "");
  };
  if (!entrada && !saida) return "";
  return `${f(entrada)} AS ${f(saida)}`;
}
function quando(ts) {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function primeiroNome(nome) {
  const p = String(nome || "").trim().split(/\s+/);
  const f = (w) => w.charAt(0) + w.slice(1).toLowerCase();
  return p.length > 1 ? `${f(p[0])} ${f(p[p.length - 1])}` : f(p[0] || "");
}
/** Quantos dias faltam para uma data ("2026-10-05"). Negativo se já passou. */
function diasAte(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date();
  return Math.round((alvo - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 864e5);
}

/** "6h", "06:30", "18h" -> número de horas (6, 6.5, 18). null se não entender. */
function horaEm(txt) {
  const m = String(txt || "").trim().toUpperCase().replace(/\s/g, "").match(/^(\d{1,2})(?:[H:](\d{2}))?H?$/);
  if (!m) return null;
  const hora = Number(m[1]), min = Number(m[2] || 0);
  return hora > 23 || min > 59 ? null : hora + min / 60;
}

/** Horas trabalhadas no dia, considerando turnos que viram a noite. */
function duracaoJornada(entrada, saida) {
  const e = horaEm(entrada), s2 = horaEm(saida);
  if (e === null || s2 === null) return null;
  return s2 > e ? s2 - e : 24 - e + s2;
}

/** "há 5 min", "ontem", "12/03" */
function quandoRelativo(ms) {
  if (!ms) return "";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const linkDaTroca = (id) => `${location.origin}${location.pathname}#/t/${id}`;

/** Soma dias a uma data no formato "2026-10-01". */
function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const x = new Date(a, m - 1, d + dias);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
const inicioDoMes = () => hojeISO().slice(0, 8) + "01";
const maiusculo = (s) => String(s || "").trim().toUpperCase();

/** Carrega um arquivo .js sob demanda (uma única vez). */
const scriptsCarregados = {};
function carregarScript(url) {
  if (scriptsCarregados[url]) return scriptsCarregados[url];
  scriptsCarregados[url] = new Promise((ok, falhou) => {
    const el = document.createElement("script");
    el.src = url;
    el.onload = ok;
    el.onerror = () => falhou(new Error("não foi possível carregar " + url));
    document.head.append(el);
  });
  return scriptsCarregados[url];
}

function senhaAleatoria() {
  const c = "abcdefghjkmnpqrstuvwxyz23456789";
  const v = new Uint32Array(8);
  crypto.getRandomValues(v);
  return Array.from(v, (n) => c[n % c.length]).join("");
}

/** Mensagens de erro do Firebase em português */
function mensagemErro(e) {
  const mapa = {
    "auth/invalid-credential": "Matrícula ou senha incorretas.",
    "auth/invalid-login-credentials": "Matrícula ou senha incorretas.",
    "auth/wrong-password": "Matrícula ou senha incorretas.",
    "auth/user-not-found": "Matrícula ou senha incorretas.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    "auth/email-already-in-use": "Já existe um usuário com essa matrícula.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/network-request-failed": "Sem conexão. Verifique a internet e tente de novo.",
    "auth/requires-recent-login": "Por segurança, saia e entre de novo antes de trocar a senha.",
    "auth/operation-not-allowed": "O login por e-mail/senha não está ativado no Firebase.",
    "functions/permission-denied": "Você só pode redefinir a senha de alguém da sua equipe.",
    "functions/not-found": "Usuário não encontrado.",
    "functions/invalid-argument": "Dados inválidos para redefinir a senha.",
    "functions/unavailable": "A função de redefinir senha não respondeu. Verifique se ela está publicada.",
    "internal": "A função de redefinir senha não respondeu. Verifique se ela está publicada e se o app está com USAR_REDEFINICAO = true.",
    "auth/unauthorized-domain": "Este endereço não está autorizado no Firebase (Authentication > Configurações > Domínios autorizados).",
    "permission-denied": "Você não tem permissão para essa ação.",
    unavailable: "Sem conexão com o servidor. Tente de novo.",
  };
  return mapa[e && e.code] || (e && e.message) || "Algo deu errado. Tente de novo.";
}


/* =====================================================================
   3. BANCO DE DADOS (Firestore)
   Coleções: usuarios/{uid}, trocas/{id}, config/setup.
   Quem pode ler e gravar cada coisa é definido no firestore.rules.
   ===================================================================== */
const Banco = {
  async sistemaConfigurado() {
    const s = await db.collection("config").doc("setup").get();
    return s.exists;
  },

  /** Primeiro acesso: cria o primeiro usuário do RH (só funciona uma vez). */
  async criarPrimeiroAdmin({ nome, matricula, senha }) {
    const cred = await auth.createUserWithEmailAndPassword(emailDaMatricula(matricula), senha);
    const uid = cred.user.uid;
    const b = db.batch();
    b.set(db.collection("usuarios").doc(uid), Banco.perfilBase({ nome, matricula, empresa: "BIANCOGRES", papel: "admin", trocarSenha: false }));
    b.set(db.collection("config").doc("setup"), { adminUid: uid, criadoEm: agora() });
    try { await b.commit(); }
    catch (e) { await cred.user.delete().catch(() => {}); throw e; }
  },

  perfilBase(d) {
    const colab = !d.papel || d.papel === "colaborador";
    return {
      nome: maiusculo(d.nome),
      matricula: String(d.matricula || "").trim(),
      empresa: maiusculo(d.empresa),
      papel: d.papel || "colaborador",
      equipe: String(d.equipe || "").trim(),
      entrada: String(d.entrada || "").trim(),
      saida: String(d.saida || "").trim(),
      horario: maiusculo(d.horario),
      gestorUid: colab ? d.gestorUid || null : null,
      gestorNome: colab ? d.gestorNome || "" : "",
      ativo: d.ativo !== false,
      trocarSenha: d.trocarSenha !== false,
    };
  },

  ouvirPerfil(uid, cb, erro) {
    return db.collection("usuarios").doc(uid).onSnapshot((s) => cb(s.exists ? { uid, ...s.data() } : null), erro);
  },

  /** Gestor: só a própria equipe. RH: todos. */
  ouvirUsuarios(perfil, cb, erro) {
    let q = db.collection("usuarios");
    if (perfil.papel !== "admin") q = q.where("gestorUid", "==", perfil.uid);
    return q.onSnapshot((s) => {
      const lista = s.docs.map((d) => ({ uid: d.id, ...d.data() }));
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      cb(lista);
    }, erro);
  },

  /** Cria a conta de login de outra pessoa sem desconectar quem está cadastrando. */
  async cadastrarUsuario(dados, senha) {
    const perfil = { ...Banco.perfilBase(dados), trocarSenha: true, criadoEm: agora() };
    const appSec = firebase.initializeApp(firebaseConfig, "cadastro-" + Date.now());
    try {
      const cred = await appSec.auth().createUserWithEmailAndPassword(emailDaMatricula(perfil.matricula), senha);
      try {
        await db.collection("usuarios").doc(cred.user.uid).set(perfil);
      } catch (e) {
        await cred.user.delete().catch(() => {});
        throw e;
      }
      await appSec.auth().signOut();
    } finally {
      await appSec.delete();
    }
  },

  /** Atualiza um cadastro. Se um gestor mudou de nome, atualiza junto a equipe dele. */
  async atualizarUsuario(uid, dados, equipeDoGestor) {
    const { trocarSenha, ...resto } = Banco.perfilBase(dados);
    const b = db.batch();
    b.update(db.collection("usuarios").doc(uid), { ...resto, atualizadoEm: agora() });
    if (resto.papel === "gestor") {
      (equipeDoGestor || []).forEach((c) => {
        if (c.gestorNome !== resto.nome) b.update(db.collection("usuarios").doc(c.uid), { gestorNome: resto.nome });
      });
    }
    await b.commit();
  },

  /** Define uma senha provisória para outra pessoa (roda no servidor, por segurança). */
  async redefinirSenha(uid, senha) {
    // a biblioteca de funções do Firebase só é baixada neste momento
    if (!firebase.app().functions) await carregarScript("https://www.gstatic.com/firebasejs/12.19.0/firebase-functions-compat.js");
    const fn = firebase.app().functions(REGIAO_FUNCOES).httpsCallable("redefinirSenha");
    const r = await fn({ uid, senha });
    return r.data;
  },

  async trocarMinhaSenha(uid, senha) {
    await auth.currentUser.updatePassword(senha);
    await db.collection("usuarios").doc(uid).update({ trocarSenha: false });
  },

  /* ----- Revezamentos ----- */
  retrato(perfil, entrada, saida) {
    return {
      nome: perfil.nome, matricula: perfil.matricula, empresa: perfil.empresa, equipe: perfil.equipe, horario: perfil.horario,
      entrada: String(entrada || "").trim(), saida: String(saida || "").trim(),
      gestorUid: perfil.gestorUid, gestorNome: perfil.gestorNome,
    };
  },

  /** Lista de colegas para o convite direcionado (só colaboradores ativos). */
  ouvirColegas(perfil, cb, erro) {
    return db.collection("usuarios").where("papel", "==", "colaborador").onSnapshot((s) => {
      cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.ativo !== false && u.uid !== perfil.uid && u.gestorUid)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    }, erro);
  },

  async criarTroca(perfil, { dataFolga, entrada, saida, observacao, colega, expiraEm }) {
    const ref = await db.collection("trocas").add({
      tipo: "revezamento",
      etapa: "aguardando_parceiro",
      solicitanteUid: perfil.uid,
      solicitante: Banco.retrato(perfil, entrada, saida),
      dataFolgaSolicitante: dataFolga,
      parceiroUid: null, parceiro: null, dataFolgaParceiro: null,
      // convite direcionado: só esta pessoa pode aceitar (null = qualquer colega com o link)
      convidadoUid: colega ? colega.uid : null,
      convidado: colega ? { nome: colega.nome, matricula: colega.matricula } : null,
      // prazo para responder (as regras do banco impedem aceitar depois disso)
      expiraEm: expiraEm || null,
      participantes: [perfil.uid],
      gestores: [perfil.gestorUid],
      aprovacoes: {},
      observacao: String(observacao || "").trim(),
      criadoEm: agora(),
      atualizadoEm: agora(),
    });
    return ref.id;
  },

  ouvirTroca(id, cb, erro) {
    return db.collection("trocas").doc(id).onSnapshot((s) => cb(s.exists ? { id: s.id, ...s.data() } : null), erro);
  },

  /** Colaborador: trocas de que participa. Gestor: da equipe. RH: todas. */
  ouvirTrocas(perfil, cb, erro) {
    let q = db.collection("trocas");
    if (perfil.papel === "colaborador") q = q.where("participantes", "array-contains", perfil.uid);
    if (perfil.papel === "gestor") q = q.where("gestores", "array-contains", perfil.uid);
    return q.onSnapshot((s) => {
      const lista = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      const ms = (t) => (t.criadoEm && t.criadoEm.toMillis ? t.criadoEm.toMillis() : Infinity);
      lista.sort((a, b) => ms(b) - ms(a));
      cb(lista);
    }, erro);
  },

  async aceitarTroca(troca, perfil, { dataFolga, entrada, saida }) {
    const g0 = troca.gestores[0];
    await db.collection("trocas").doc(troca.id).update({
      etapa: "aguardando_gestor",
      parceiroUid: perfil.uid,
      parceiro: Banco.retrato(perfil, entrada, saida),
      dataFolgaParceiro: dataFolga,
      participantes: [troca.solicitanteUid, perfil.uid],
      gestores: perfil.gestorUid === g0 ? [g0] : [g0, perfil.gestorUid],
      atualizadoEm: agora(),
    });
  },

  async cancelarTroca(troca) {
    await db.collection("trocas").doc(troca.id).update({ etapa: "cancelada", atualizadoEm: agora() });
  },

  /** Com dois gestores (equipes diferentes), só fica aprovada quando os dois aprovam. */
  async decidirTroca(troca, perfil, decisao, motivo) {
    const aprovacoes = { ...(troca.aprovacoes || {}), [perfil.uid]: { decisao } };
    const todos = troca.gestores.every((g) => aprovacoes[g] && aprovacoes[g].decisao === "aprovada");
    await db.collection("trocas").doc(troca.id).update({
      ["aprovacoes." + perfil.uid]: { decisao, nome: perfil.nome, motivo: String(motivo || "").trim(), em: agora() },
      etapa: decisao === "recusada" ? "recusada" : todos ? "aprovada" : "aguardando_gestor",
      atualizadoEm: agora(),
    });
  },

  /** Depois de aprovada: o gestor (ou o RH) marca que o documento foi gerado, assinado e entregue. */
  async concluirTroca(troca, perfil) {
    await db.collection("trocas").doc(troca.id).update({
      etapa: "concluida",
      concluidaPor: { uid: perfil.uid, nome: perfil.nome, em: agora() },
      atualizadoEm: agora(),
    });
  },
};


/* =====================================================================
   4. PDF DO FORMULÁRIO UN-FO-SPE-023
   Escreve as informações sobre o modelo oficial em branco, sem alterá-lo.
   Coordenadas em pontos, com origem no canto inferior esquerdo da página.
   ===================================================================== */
const Pdf = {
  // Faixas das 8 linhas da tabela de justificativa
  LINHAS: [[640.1, 617.7], [617.7, 594.8], [594.8, 573.6], [573.6, 557.2], [557.2, 540.9], [540.9, 524.6], [524.6, 508.3], [508.3, 491.9]],
  // Centro e largura máxima de cada coluna da tabela
  COL: { data: [53.45, 44], ent: [102.7, 46], sai: [152.6, 46], oc: [187.8, 18], just: [330.25, 260] },
  modelo: null,

  /** Onde cada informação entra no formulário (uma folha). */
  layout(f) {
    const t = [];
    const add = (text, x, y, size, o = {}) => {
      if (text) t.push({ text, x, y, size, bold: !!o.bold, align: o.align || "left", maxW: o.maxW || 400, wrap: o.wrap, band: o.band });
    };
    add(maiusculo(f.nome), 101, 718.42, 7.56, { maxW: 180 });
    add(String(f.matricula || "").trim(), 314.6, 721.3, 7.56, { align: "center", maxW: 56 });
    const emp = maiusculo(f.empresa);
    const y = emp === "BIANCOGRES" ? 730.54 : emp === "LM COMÉRCIO" || emp === "LM COMERCIO" ? 720.22 : emp ? 707.74 : null;
    if (y) add("x", 364.9, y, 7.56, { align: "center" });
    if (y === 707.74) add(emp, 389, 709.4, 7, { maxW: 72 });
    (f.linhas || []).slice(0, 8).forEach((r, i) => {
      const [top, bot] = Pdf.LINHAS[i];
      const mid = (top + bot) / 2, C = Pdf.COL;
      add(r.data ? dataBR(r.data, true) : "", C.data[0], mid - 2.4, 6.72, { align: "center", maxW: C.data[1] });
      add(String(r.entrada || "").trim(), C.ent[0], mid - 2.4, 6.72, { align: "center", maxW: C.ent[1] });
      add(String(r.saida || "").trim(), C.sai[0], mid - 2.4, 6.72, { align: "center", maxW: C.sai[1] });
      add(r.ocorrencia || "", C.oc[0], mid - 2.4, 6.72, { align: "center", maxW: C.oc[1] });
      add(maiusculo(r.justificativa), C.just[0], mid - 2.7, 7.56, { align: "center", bold: true, maxW: C.just[1], wrap: true, band: [top, bot] });
    });
    add(f.aPartir ? dataBR(f.aPartir, true) : "", 184.5, 412.39, 9, { maxW: 270 });
    add(maiusculo(f.horarioAnterior), 111, 397.6, 6.72, { maxW: 156 });
    add(maiusculo(f.horarioNovo), 109, 387.4, 6.72, { maxW: 156 });
    add(maiusculo(f.gestor), 127, 369.3, 6.72, { maxW: 210 });
    return t;
  },

  /** Reduz a fonte quando o texto não cabe; na justificativa, quebra em até 2 linhas. */
  posicionar(it, medir) {
    const pos = (text, y, size) => ({ text, size, y, x: it.align === "center" ? it.x - medir(text, size) / 2 : it.x });
    if (it.wrap && medir(it.text, it.size) > it.maxW) {
      const [top, bot] = it.band;
      const h = top - bot, mid = (top + bot) / 2;
      let size = it.size, linhas;
      for (;;) {
        linhas = Pdf.quebrar(it.text, size, it.maxW, medir);
        const ok = linhas.length <= 2 && linhas.every((l) => medir(l, size) <= it.maxW) && linhas.length * size * 1.27 <= h - 1;
        if (ok || size <= 4) break;
        size -= 0.25;
      }
      const lh = size * 1.27, y0 = mid + (linhas.length - 1) * lh / 2 - size * 0.357;
      return linhas.map((l, i) => pos(l, y0 - i * lh, size));
    }
    let size = it.size;
    while (size > 4 && medir(it.text, size) > it.maxW) size -= 0.25;
    return [pos(it.text, it.y, size)];
  },

  quebrar(texto, size, maxW, medir) {
    const out = [];
    let cur = "";
    for (const w of texto.split(/\s+/)) {
      const tent = cur ? cur + " " + w : w;
      if (!cur || medir(tent, size) <= maxW) cur = tent;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  },

  /** As duas folhas do revezamento: uma para cada colaborador, citando o outro. */
  folhas(troca) {
    const folha = (eu, minhaData, outro) => ({
      nome: eu.nome, matricula: eu.matricula, empresa: eu.empresa,
      linhas: [
        { data: minhaData, entrada: eu.entrada, saida: eu.saida, justificativa: "FOLGA - TROCA DE ESCALA" },
        { justificativa: `COLABORADOR ${outro.nome} - ${outro.matricula} IRA TRABALHAR NO LUGAR` },
      ],
      // No revezamento não há mudança de horário: as linhas "a partir de",
      // "horário anterior" e "novo horário" ficam em branco. Só o gestor é preenchido.
      gestor: eu.gestorNome,
    });
    return [
      folha(troca.solicitante, troca.dataFolgaSolicitante, troca.parceiro),
      folha(troca.parceiro, troca.dataFolgaParceiro, troca.solicitante),
    ];
  },

  async gerar(folhas) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    if (!Pdf.modelo) {
      const r = await fetch(MODELO_PDF);
      if (!r.ok) throw new Error("não foi possível carregar o modelo do formulário");
      Pdf.modelo = new Uint8Array(await r.arrayBuffer());
    }
    const modelo = await PDFDocument.load(Pdf.modelo);
    const doc = await PDFDocument.create();
    const reg = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    for (const f of folhas) {
      const [pagina] = await doc.copyPages(modelo, [0]);
      doc.addPage(pagina);
      for (const it of Pdf.layout(f)) {
        const fonte = it.bold ? bold : reg;
        const texto = it.text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
        for (const p of Pdf.posicionar({ ...it, text: texto }, (tx, sz) => fonte.widthOfTextAtSize(tx, sz))) {
          pagina.drawText(p.text, { x: p.x, y: p.y, size: p.size, font: fonte, color: rgb(0, 0, 0) });
        }
      }
    }
    doc.setTitle("Ocorrência de Registro do Ponto - UN-FO-SPE-023");
    return doc.save();
  },

  nomeArquivo(troca) {
    const limpa = (s) => maiusculo(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    return `REVEZAMENTO_${limpa(troca.solicitante.nome).split("_")[0]}_${limpa(troca.parceiro.nome).split("_")[0]}_${dataBR(troca.dataFolgaSolicitante, true).replace(/\//g, "-")}.pdf`;
  },

  /** Gera o PDF e entrega: no celular abre o compartilhamento; no computador baixa o arquivo. */
  async baixar(troca) {
    const lista = Array.isArray(troca) ? troca : [troca];
    const folhas = lista.flatMap((t) => Pdf.folhas(t));
    const bytes = await Pdf.gerar(folhas);
    const nome = lista.length === 1 ? Pdf.nomeArquivo(lista[0])
      : `REVEZAMENTOS_${lista.length}_${hojeISO().split("-").reverse().join("-")}.pdf`;
    const blob = new Blob([bytes], { type: "application/pdf" });
    const arquivo = new File([blob], nome, { type: "application/pdf" });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: nome }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};


/* =====================================================================
   4.4 REGRAS DA ESCALA
   Confere o que o próprio formulário exige: 11 horas de descanso entre
   jornadas e proibição de trabalhar na folga. Também avisa quando duas
   pessoas da mesma equipe folgam no mesmo dia.
   ===================================================================== */
const ETAPAS_VALEM = ["aguardando_parceiro", "aguardando_gestor", "aprovada", "concluida"];

/** Quem folga e quem trabalha em cada data, numa troca. */
function diasDaTroca(t) {
  const dias = [];
  if (t.solicitante && t.dataFolgaSolicitante) {
    dias.push({ data: t.dataFolgaSolicitante, folga: { uid: t.solicitanteUid, p: t.solicitante }, trabalha: t.parceiro ? { uid: t.parceiroUid, p: t.parceiro } : null });
  }
  if (t.parceiro && t.dataFolgaParceiro) {
    dias.push({ data: t.dataFolgaParceiro, folga: { uid: t.parceiroUid, p: t.parceiro }, trabalha: { uid: t.solicitanteUid, p: t.solicitante } });
  }
  return dias;
}

/**
 * Procura problemas na troca, comparando com as outras já registradas.
 * Devolve uma lista de { nivel: "alerta" | "atencao", texto }.
 * "alerta" = contraria o formulário. "atencao" = vale conferir.
 */
function conflitosDaTroca(troca, outras) {
  const achados = [];
  const add = (nivel, texto) => { if (!achados.some((x) => x.texto === texto)) achados.push({ nivel, texto }); };
  const demais = (outras || []).filter((t) => t.id !== troca.id && ETAPAS_VALEM.includes(t.etapa));
  const meus = diasDaTroca(troca);

  // o que cada pessoa já tem marcado nos outros revezamentos
  const agenda = {}; // uid -> { folga: Set(datas), trabalha: Set(datas), pessoa }
  const anota = (uid, pessoa, tipo, data) => {
    if (!uid || !data) return;
    agenda[uid] = agenda[uid] || { folga: new Set(), trabalha: new Set(), pessoa };
    agenda[uid][tipo].add(data);
  };
  demais.forEach((t) => diasDaTroca(t).forEach((d) => {
    if (d.folga) anota(d.folga.uid, d.folga.p, "folga", d.data);
    if (d.trabalha) anota(d.trabalha.uid, d.trabalha.p, "trabalha", d.data);
  }));

  meus.forEach((d) => {
    // 1) trabalhar num dia em que a pessoa já tem folga combinada
    if (d.trabalha && agenda[d.trabalha.uid] && agenda[d.trabalha.uid].folga.has(d.data)) {
      add("alerta", `${primeiroNome(d.trabalha.p.nome)} já tem folga combinada em ${dataBR(d.data)} e não pode trabalhar nesse dia.`);
    }
    // 2) folgar num dia em que a pessoa já se comprometeu a cobrir outro colega
    if (d.folga && agenda[d.folga.uid] && agenda[d.folga.uid].trabalha.has(d.data)) {
      add("alerta", `${primeiroNome(d.folga.p.nome)} já vai cobrir outro colega em ${dataBR(d.data)} e não pode folgar nesse dia.`);
    }
    // 3) duas pessoas da mesma equipe folgando no mesmo dia
    if (d.folga && d.folga.p.equipe) {
      Object.values(agenda).forEach((a) => {
        if (a.pessoa.equipe === d.folga.p.equipe && a.pessoa.matricula !== d.folga.p.matricula && a.folga.has(d.data)) {
          add("atencao", `${primeiroNome(a.pessoa.nome)}, da mesma equipe ${d.folga.p.equipe}, também folga em ${dataBR(d.data)}.`);
        }
      });
    }
    // 4) descanso de 11 horas entre jornadas, quando a pessoa cobre dias seguidos
    if (d.trabalha) {
      const a = agenda[d.trabalha.uid];
      const vizinhos = [somarDias(d.data, -1), somarDias(d.data, 1)].filter((x) => a && a.trabalha.has(x));
      const jornada = duracaoJornada(d.trabalha.p.entrada || d.trabalha.p.horario, d.trabalha.p.saida);
      if (vizinhos.length && jornada !== null && 24 - jornada < 11) {
        add("alerta", `${primeiroNome(d.trabalha.p.nome)} trabalharia em dias seguidos (${dataBR(vizinhos[0])} e ${dataBR(d.data)}) com menos de 11 horas de descanso entre as jornadas.`);
      } else if (vizinhos.length) {
        add("atencao", `${primeiroNome(d.trabalha.p.nome)} trabalharia em dias seguidos: ${dataBR(vizinhos[0])} e ${dataBR(d.data)}. Confira o descanso de 11 horas.`);
      }
    }
  });

  // 5) dentro da própria troca: jornada longa demais para o descanso de 11 horas
  [troca.solicitante, troca.parceiro].filter(Boolean).forEach((p) => {
    const j = duracaoJornada(p.entrada, p.saida);
    if (j !== null && j > 13) {
      const horas = Math.floor(j), min = Math.round((j - horas) * 60);
      add("atencao", `A jornada de ${primeiroNome(p.nome)} (${horas}h${min ? String(min).padStart(2, "0") : ""}) deixa menos de 11 horas até o dia seguinte.`);
    }
  });

  return achados;
}

/** Caixa com os avisos das regras. */
function caixaConflitos(lista, titulo) {
  if (!lista.length) return null;
  const grave = lista.some((x) => x.nivel === "alerta");
  return h("div", { class: "cartao pilha conflitos " + (grave ? "grave" : "") , style: { gap: "8px" } },
    h("h2", {}, titulo || (grave ? "Atenção: confira antes de seguir" : "Pontos para conferir")),
    h("ul", { class: "lista-conflitos" }, lista.map((x) => h("li", { class: x.nivel }, x.texto))),
    h("p", { class: "sub" }, "Regras do formulário: descanso de 11 horas entre jornadas e proibição de trabalhar na folga."));
}

/* =====================================================================
   4.5 CENTRAL DE NOTIFICAÇÕES
   As notificações são montadas a partir dos revezamentos que o app já carregou,
   sem buscar nada a mais no banco. O que já foi lido fica guardado no aparelho.
   ===================================================================== */
const Notificacoes = {
  perfil: null, parar: null, lista: [], avisos: new Set(),

  chaveLidas: (uid) => "notificacoes-lidas:" + uid,

  lidas() {
    try { return JSON.parse(localStorage.getItem(Notificacoes.chaveLidas(Notificacoes.perfil.uid))) || {}; }
    catch (e) { return {}; }
  },
  salvarLidas(obj) {
    try { localStorage.setItem(Notificacoes.chaveLidas(Notificacoes.perfil.uid), JSON.stringify(obj)); } catch (e) { /* ignora */ }
  },

  /** Começa a acompanhar os revezamentos da pessoa (uma vez, logo após o login). */
  iniciar(perfil) {
    Notificacoes.encerrar();
    Notificacoes.perfil = perfil;
    Notificacoes.parar = Banco.ouvirTrocas(perfil, (trocas) => {
      Notificacoes.lista = Notificacoes.montar(perfil, trocas);
      Notificacoes.avisar();
    }, () => { /* sem notificações se a lista falhar */ });
  },
  encerrar() {
    if (Notificacoes.parar) Notificacoes.parar();
    Notificacoes.parar = null; Notificacoes.lista = []; Notificacoes.perfil = null;
  },

  /** Transforma a situação de cada revezamento em um aviso curto. */
  montar(perfil, trocas) {
    const avisos = [];
    const add = (t, texto, acao) => avisos.push({
      chave: t.id + ":" + t.etapa, id: t.id, texto, acao,
      detalhe: [primeiroNome(t.solicitante.nome) + (t.parceiro ? " ⇄ " + primeiroNome(t.parceiro.nome) : ""),
        "folga " + dataBR(t.dataFolgaSolicitante, true) + (t.dataFolgaParceiro ? " e " + dataBR(t.dataFolgaParceiro, true) : "")].join(" · "),
      ms: t.atualizadoEm && t.atualizadoEm.toMillis ? t.atualizadoEm.toMillis() : 0,
    });
    trocas.forEach((t) => {
      const souSolicitante = t.solicitanteUid === perfil.uid;
      const souParceiro = t.parceiroUid === perfil.uid;
      const souGestor = perfil.papel === "gestor" && t.gestores.includes(perfil.uid);
      const eu = souSolicitante ? t.parceiro : t.solicitante;
      const outro = eu ? primeiroNome(eu.nome) : "O colega";
      const dupla = primeiroNome(t.solicitante.nome) + (t.parceiro ? " e " + primeiroNome(t.parceiro.nome) : "");
      if (souSolicitante || souParceiro) {
        if (t.etapa === "aguardando_gestor" && souSolicitante) add(t, `${outro} aceitou o revezamento. Agora é com o gestor.`, "Ver pedido");
        if (t.etapa === "aprovada") add(t, "Seu revezamento foi aprovado.", "Ver pedido");
        if (t.etapa === "recusada") add(t, "Seu revezamento foi recusado pelo gestor.", "Ver motivo");
        if (t.etapa === "concluida") add(t, "Revezamento concluído. O documento já foi gerado.", "Ver pedido");
        if (t.etapa === "cancelada" && souParceiro) add(t, `${outro} cancelou o revezamento.`, "Ver pedido");
      }
      // lembrete da véspera e do dia, para quem folga e para quem cobre
      if ((souSolicitante || souParceiro) && (t.etapa === "aprovada" || t.etapa === "concluida")) {
        diasDaTroca(t).forEach((d) => {
          const quantos = diasAte(d.data);
          if (quantos !== 0 && quantos !== 1) return;
          const amanha = quantos === 1 ? "Amanhã" : "Hoje";
          if (d.folga && d.folga.uid === perfil.uid) {
            avisos.push({ chave: `${t.id}:folga:${d.data}`, id: t.id, ms: Date.now(), acao: "Ver pedido",
              texto: `${amanha} (${dataBR(d.data)}) é a sua folga do revezamento. ${d.trabalha ? primeiroNome(d.trabalha.p.nome) + " cobre você." : ""}`.trim(),
              detalhe: "Lembrete" });
          }
          if (d.trabalha && d.trabalha.uid === perfil.uid) {
            avisos.push({ chave: `${t.id}:cobre:${d.data}`, id: t.id, ms: Date.now(), acao: "Ver pedido",
              texto: `${amanha} (${dataBR(d.data)}) você trabalha no lugar de ${primeiroNome(d.folga.p.nome)}.`,
              detalhe: "Lembrete" });
          }
        });
      }
      if (souGestor && t.etapa === "aguardando_gestor" && !(t.aprovacoes || {})[perfil.uid]) {
        add(t, `${dupla} combinaram um revezamento e aguardam a sua aprovação.`, "Aprovar");
      }
      if ((souGestor || perfil.papel === "admin") && t.etapa === "aprovada") {
        add(t, `${dupla}: revezamento aprovado, falta gerar o PDF e concluir.`, "Concluir");
      }
    });
    return avisos.sort((a, b) => b.ms - a.ms).slice(0, 50);
  },

  naoLidas() {
    const lidas = Notificacoes.lidas();
    return Notificacoes.lista.filter((n) => !lidas[n.chave]);
  },
  marcarTodasLidas() {
    const lidas = Notificacoes.lidas();
    Notificacoes.lista.forEach((n) => { lidas[n.chave] = 1; });
    // guarda só o que ainda está na lista, para o registro não crescer sem parar
    const atuais = {};
    Notificacoes.lista.forEach((n) => { if (lidas[n.chave]) atuais[n.chave] = 1; });
    Notificacoes.salvarLidas(atuais);
    Notificacoes.avisar();
  },

  aoMudar(fn) { Notificacoes.avisos.add(fn); fn(); },
  avisar() {
    Notificacoes.avisos.forEach((fn) => {
      if (fn.elemento && !document.contains(fn.elemento)) return Notificacoes.avisos.delete(fn);
      fn();
    });
  },
};

/* =====================================================================
   5. INTERFACE — peças reutilizáveis
   h("div", { class: "x", onClick: fn }, "texto", outroElemento) cria um elemento.
   ===================================================================== */
const PROPRIEDADES = ["value", "checked", "disabled", "selected", "readOnly", "required", "htmlFor", "min", "max", "maxLength", "type"];

function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPRIEDADES.includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  });
  return mais(el, ...filhos);
}
/** Acrescenta filhos ignorando valores vazios (false, null, undefined). */
function mais(el, ...filhos) {
  filhos.flat(Infinity).forEach((f) => {
    if (f === null || f === undefined || f === false) return;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  });
  return el;
}
/** Troca todo o conteúdo de um elemento. */
function por(el, ...filhos) { el.replaceChildren(); return mais(el, ...filhos); }

const ir = (rota) => { location.hash = rota; };

/** Logotipo (calendário com setas de troca) */
function logo() {
  const s = document.createElement("span");
  s.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#18232C"/>' +
    '<rect x="11" y="13" width="26" height="22" rx="3" fill="none" stroke="#EEF0EE" stroke-width="2.4"/>' +
    '<rect x="11" y="13" width="26" height="6" fill="#EEF0EE"/>' +
    '<path d="M16 25h14m-3-3 3 3-3 3" fill="none" stroke="#8DB3E2" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M32 30H18m3-3-3 3 3 3" fill="none" stroke="#EEF0EE" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return s.firstChild;
}

/** Itens do menu (lateral no computador, abas no celular) conforme o perfil. */
function menuDe(perfil, rota, pendentes) {
  if (perfil.papel === "colaborador") {
    return [
      { rotulo: "Meus revezamentos", href: "#/", ativo: rota === "/" },
      { rotulo: "Novo revezamento", href: "#/nova", ativo: rota === "/nova" },
    ];
  }
  return [
    { rotulo: "Pendentes", href: "#/", ativo: rota === "/", badge: pendentes || null },
    { rotulo: "Calendário", href: "#/calendario", ativo: rota === "/calendario" },
    { rotulo: "Todas as trocas", href: "#/trocas", ativo: rota === "/trocas" },
    { rotulo: perfil.papel === "admin" ? "Usuários" : "Minha equipe", href: "#/equipe", ativo: rota === "/equipe" || rota.startsWith("/usuario/") },
  ];
}

/**
 * Monta a estrutura da página e devolve o <main> onde entra o conteúdo.
 * Celular: barra superior + abas. Computador: menu lateral + cabeçalho claro.
 */
function tela({ titulo, sub, voltar, menu = [], abas = true, acao, direita, perfil }) {
  const main = h("main", { class: "conteudo" });
  const itemMenu = (i, cls) => h("a", { class: cls, href: i.href, "aria-current": i.ativo ? "page" : null },
    h("span", {}, i.rotulo), i.badge ? h("span", { class: "badge" }, i.badge) : null);

  const lateral = perfil && h("aside", { class: "lateral" },
    h("div", { class: "marca-lateral" }, logo(), h("b", {}, "Troca de escala")),
    h("nav", { class: "menu" }, menu.map((i) => itemMenu(i, "item-menu"))),
    h("div", { class: "usuario-lateral" }, iniciais(perfil.nome),
      h("div", { class: "quem-txt" }, h("b", {}, primeiroNome(perfil.nome)), h("small", {}, "Mat. " + perfil.matricula)),
      h("button", { class: "btn-sair", onClick: sair }, "Sair")));

  const topo = h("div", { class: "topo" },
    voltar && h("button", { class: "voltar", onClick: voltar, "aria-label": "Voltar" }, "←"),
    h("div", { class: "titulos" }, h("h1", {}, titulo), sub && h("small", {}, sub)),
    h("div", { class: "topo-direita" }, direita,
      perfil && sino(),
      acao && h("button", { class: "btn primario so-desktop", onClick: acao.onClick }, acao.rotulo),
      perfil && !voltar && h("button", { class: "sair-celular", onClick: sair }, "Sair")));

  const barraAbas = abas && menu.length > 1 && h("nav", { class: "abas" }, menu.map((i) => itemMenu(i, "aba")));

  por(document.getElementById("app"), h("div", { class: "shell" + (perfil ? " com-lateral" : "") },
    lateral,
    h("div", { class: "coluna" }, h("header", { class: "cabecalho" }, topo, barraAbas), main),
    acao && h("button", { class: "btn primario flutuante", onClick: acao.onClick }, acao.rotulo)));
  window.scrollTo(0, 0);
  return main;
}

/** Sino com a quantidade de avisos não lidos. */
function sino() {
  const conta = h("span", { class: "badge", hidden: true });
  const b = h("button", { class: "sino", "aria-label": "Notificações", onClick: () => ir("/notificacoes") },
    h("span", { class: "sino-icone", "aria-hidden": "true" }, "🔔"), conta);
  const atualizar = () => {
    const n = Notificacoes.naoLidas().length;
    conta.textContent = n > 9 ? "9+" : String(n);
    conta.hidden = n === 0;
    b.classList.toggle("tem-aviso", n > 0);
  };
  atualizar.elemento = b;
  Notificacoes.aoMudar(atualizar);
  return b;
}

let timerToast;
function toast(msg) {
  const antigo = document.querySelector(".toast");
  if (antigo) antigo.remove();
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.remove(), 3200);
}

/** Situação mostrada na tela (leva o prazo vencido em conta). */
const situacaoDe = (t) => (expirada(t) ? "expirada" : t.etapa);

function etiqueta(etapa) {
  const e = ETAPAS[etapa] || { rotulo: etapa, tom: "neutro" };
  return h("span", { class: "etiqueta " + e.tom }, e.rotulo);
}
const aviso = (tipo, ...conteudo) => h("div", { class: "aviso " + (tipo || "") }, ...conteudo);

/** Caixa de erro: const erro = caixaErro(); erro.mostrar("texto"); erro.mostrar("") esconde. */
function caixaErro() {
  const el = h("div", { class: "aviso erro", role: "alert", hidden: true });
  el.mostrar = (msg) => { el.textContent = msg || ""; el.hidden = !msg; };
  return el;
}
function campo(rotulo, controle, { ajuda, inteiro } = {}) {
  return h("label", { class: "campo" + (inteiro ? " inteiro" : "") }, rotulo, controle, ajuda && h("span", { class: "ajuda" }, ajuda));
}
function iniciais(nome) {
  const p = String(nome || "?").trim().split(/\s+/);
  return h("span", { class: "avatar", "aria-hidden": "true" }, (p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : ""));
}
const carregando = () => h("div", { class: "carregando" }, "Carregando…");

/** Os dois dias do revezamento: em cada um, quem folga e quem trabalha no lugar. */
function parDeFolgas(troca, euUid) {
  const s = troca.solicitante, p = troca.parceiro;
  const nome = (pessoa, uid) => (uid && uid === euUid ? "Você" : pessoa ? primeiroNome(pessoa.nome) : "—");
  const dia = (data, folga, trabalha) => h("div", { class: "dia" },
    h("div", { class: "quando" }, dataBR(data), h("small", {}, diaSemana(data))),
    h("div", { class: "quem" }, "Folga: ", h("strong", {}, folga), h("br"), "Trabalha: ", h("strong", {}, trabalha)));
  return h("div", { class: "par" },
    dia(troca.dataFolgaSolicitante, nome(s, troca.solicitanteUid), p ? nome(p, troca.parceiroUid) : "a definir"),
    troca.dataFolgaParceiro
      ? dia(troca.dataFolgaParceiro, nome(p, troca.parceiroUid), nome(s, troca.solicitanteUid))
      : h("div", { class: "dia pendente" }, h("div", { class: "quando apagado" }, "—", h("small", {}, "aguardando colega")),
          h("div", { class: "quem" }, "O colega informa o dia da folga dele ao aceitar.")));
}

/** Botão que gera o PDF com as duas folhas do formulário. */
function botaoPdf(troca, erro, pequeno) {
  const b = h("button", { class: "btn " + (pequeno ? "pequeno" : "primario bloco"), type: "button" }, pequeno ? "PDF" : "Gerar PDF do revezamento");
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const texto = b.textContent;
    b.disabled = true; b.textContent = "Gerando…";
    try { await Pdf.baixar(troca); }
    catch (err) { (erro ? erro.mostrar : toast)("Não foi possível gerar o PDF: " + (err.message || err)); }
    finally { b.disabled = false; b.textContent = texto; }
  });
  return b;
}


/* =====================================================================
   6. TELAS
   Cada tela recebe o perfil de quem está logado e desenha a página.
   Ouvintes do banco são registrados com guardar() e desligados ao trocar de tela.
   ===================================================================== */

/* ---------- 6.1 Login, primeiro acesso e troca de senha ---------- */
function formEntrada(...filhos) {
  const f = h("form", { class: "entrada", novalidate: true }, ...filhos);
  por(document.getElementById("app"), f);
  return f;
}
const marca = (sub) => h("div", { class: "marca" }, logo(), h("div", {}, h("h1", {}, "Troca de escala"), h("p", {}, sub)));

function telaLogin() {
  const matricula = h("input", { inputmode: "numeric", autocomplete: "username" });
  const senha = h("input", { type: "password", autocomplete: "current-password" });
  const erro = caixaErro();
  const botao = h("button", { class: "btn primario bloco" }, "Entrar");
  const linkSetup = h("a", { class: "btn bloco", href: "#/primeiro-acesso", hidden: true }, "Configurar o sistema pela primeira vez");
  const form = formEntrada(
    marca("Revezamento entre colaboradores"),
    /^#\/t\//.test(location.hash) && aviso("", "Um colega convidou você para um revezamento. Entre para ver o pedido."),
    h("div", { class: "campos" }, campo("Matrícula", matricula, { inteiro: true }), campo("Senha", senha, { inteiro: true })),
    erro, botao,
    h("p", { class: "sub", style: { textAlign: "center" } }, "Esqueceu a senha? Fale com o seu gestor ou com o RH."),
    linkSetup);
  Banco.sistemaConfigurado().then((ok) => { linkSetup.hidden = ok; }).catch(() => {});
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!matricula.value.trim() || !senha.value) return erro.mostrar("Informe matrícula e senha.");
    erro.mostrar(""); botao.disabled = true; botao.textContent = "Entrando…";
    try { await auth.signInWithEmailAndPassword(emailDaMatricula(matricula.value), senha.value); }
    catch (err) { erro.mostrar(mensagemErro(err)); botao.disabled = false; botao.textContent = "Entrar"; }
  });
  matricula.focus();
}

function telaPrimeiroAcesso() {
  const nome = h("input", {}), matricula = h("input", { inputmode: "numeric" });
  const senha = h("input", { type: "password", autocomplete: "new-password" });
  const confirma = h("input", { type: "password", autocomplete: "new-password" });
  const erro = caixaErro();
  const botao = h("button", { class: "btn primario bloco" }, "Criar acesso do RH");
  const form = formEntrada(
    marca("Configuração inicial"),
    aviso("", "Cadastre o primeiro usuário do RH. Ele poderá cadastrar os gestores e os colaboradores. Esta tela só funciona uma vez."),
    h("div", { class: "campos" }, campo("Nome completo", nome, { inteiro: true }), campo("Matrícula", matricula, { inteiro: true }),
      campo("Senha", senha), campo("Confirmar senha", confirma)),
    erro, botao, h("a", { class: "btn bloco", href: "#/" }, "Voltar ao login"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!nome.value.trim() || !matricula.value.trim()) return erro.mostrar("Preencha nome e matrícula.");
    if (senha.value.length < 6) return erro.mostrar("A senha precisa ter pelo menos 6 caracteres.");
    if (senha.value !== confirma.value) return erro.mostrar("As senhas não conferem.");
    erro.mostrar(""); botao.disabled = true; botao.textContent = "Criando…";
    try { await Banco.criarPrimeiroAdmin({ nome: nome.value, matricula: matricula.value, senha: senha.value }); ir("/"); }
    catch (err) {
      erro.mostrar(err.code === "permission-denied" ? "O sistema já foi configurado. Entre com sua matrícula." : mensagemErro(err));
      botao.disabled = false; botao.textContent = "Criar acesso do RH";
    }
  });
}

function telaTrocarSenha(perfil) {
  const senha = h("input", { type: "password", autocomplete: "new-password" });
  const confirma = h("input", { type: "password", autocomplete: "new-password" });
  const erro = caixaErro();
  const botao = h("button", { class: "btn primario bloco" }, "Salvar senha");
  const form = formEntrada(
    marca("Olá, " + primeiroNome(perfil.nome).split(" ")[0]),
    aviso("", "Este é o seu primeiro acesso. Crie uma senha só sua para continuar."),
    h("div", { class: "campos" }, campo("Nova senha", senha, { inteiro: true }), campo("Confirmar nova senha", confirma, { inteiro: true })),
    erro, botao, h("button", { type: "button", class: "btn bloco", onClick: sair }, "Sair"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (senha.value.length < 6) return erro.mostrar("A senha precisa ter pelo menos 6 caracteres.");
    if (senha.value !== confirma.value) return erro.mostrar("As senhas não conferem.");
    erro.mostrar(""); botao.disabled = true; botao.textContent = "Salvando…";
    try { await Banco.trocarMinhaSenha(perfil.uid, senha.value); }
    catch (err) { erro.mostrar(mensagemErro(err)); botao.disabled = false; botao.textContent = "Salvar senha"; }
  });
  senha.focus();
}

/* ---------- 6.2 Filtros e busca (usados pelas telas abaixo) ---------- */
const SITUACOES = [
  { id: "aguardando_parceiro", rotulo: "Aguardando colega" },
  { id: "aguardando_gestor", rotulo: "Aguardando gestor" },
  { id: "aprovada", rotulo: "Aprovada" },
  { id: "concluida", rotulo: "Concluída" },
  { id: "recusada", rotulo: "Recusada" },
  { id: "cancelada", rotulo: "Cancelada" },
  { id: "expirada", rotulo: "Prazo vencido" },
];
const PERIODOS = [
  { id: "todos", rotulo: "Qualquer data" },
  { id: "futuras", rotulo: "A partir de hoje" },
  { id: "mes", rotulo: "Este mês" },
  { id: "30", rotulo: "Últimos 30 dias" },
  { id: "90", rotulo: "Últimos 90 dias" },
  { id: "intervalo", rotulo: "Escolher período" },
];
const filtroVazio = () => ({ busca: "", situacoes: [], periodo: "todos", de: "", ate: "", equipe: "", gestor: "", mostrar: 20 });

/** Intervalo de datas (de, até) do período escolhido. "" = sem limite. */
function intervaloDe(f) {
  const hoje = hojeISO();
  if (f.periodo === "futuras") return [hoje, ""];
  if (f.periodo === "mes") return [inicioDoMes(), ""];
  if (f.periodo === "30") return [somarDias(hoje, -30), ""];
  if (f.periodo === "90") return [somarDias(hoje, -90), ""];
  if (f.periodo === "intervalo") return [f.de || "", f.ate || ""];
  return ["", ""];
}

/** Aplica busca, situação, período, equipe e gestor a uma lista de trocas. */
function filtrarTrocas(lista, f) {
  const b = f.busca.trim().toUpperCase();
  const [de, ate] = intervaloDe(f);
  const pessoas = (t) => [t.solicitante, t.parceiro].filter(Boolean);
  return lista.filter((t) => {
    if (f.situacoes.length && !f.situacoes.includes(situacaoDe(t))) return false;
    if (de || ate) {
      const datas = [t.dataFolgaSolicitante, t.dataFolgaParceiro].filter(Boolean);
      // entra se pelo menos uma das folgas estiver dentro do período
      if (!datas.some((d) => (!de || d >= de) && (!ate || d <= ate))) return false;
    }
    if (f.equipe && !pessoas(t).some((p) => p.equipe === f.equipe)) return false;
    if (f.gestor && !pessoas(t).some((p) => p.gestorUid === f.gestor)) return false;
    if (b && !pessoas(t).some((p) => p.nome.includes(b) || p.matricula.toUpperCase().includes(b))) return false;
    return true;
  });
}

/** Há busca ou filtro em uso? */
function temFiltro(f) { return Boolean(f.busca.trim()) || filtrosAtivos(f) > 0; }

/** Quantos filtros estão ativos (fora a busca, que já aparece escrita no campo). */
function filtrosAtivos(f) {
  return (f.situacoes.length ? 1 : 0) + (f.periodo !== "todos" ? 1 : 0) + (f.equipe ? 1 : 0) + (f.gestor ? 1 : 0);
}

/**
 * Painel de filtros: busca sempre visível e o resto dentro de "Filtros", que fica recolhido.
 * opts: { equipes, gestores } — listas opcionais, montadas a partir das trocas carregadas.
 */
function painelFiltros(f, opts, aoMudar) {
  const aplicar = () => { f.mostrar = 20; atualizarResumo(); aoMudar(); };
  const busca = h("input", { type: "search", placeholder: "Buscar por nome ou matrícula", value: f.busca });
  let debounce;
  busca.addEventListener("input", () => {
    f.busca = busca.value;
    clearTimeout(debounce);
    debounce = setTimeout(aplicar, 200);
  });

  const marca = (lista, id, ligado) => (ligado ? [...lista, id] : lista.filter((x) => x !== id));
  const situacoes = h("div", { class: "filtros" }, SITUACOES.map((x) => {
    const b = h("button", { type: "button", "aria-pressed": String(f.situacoes.includes(x.id)) }, x.rotulo);
    b.addEventListener("click", () => {
      f.situacoes = marca(f.situacoes, x.id, !f.situacoes.includes(x.id));
      b.setAttribute("aria-pressed", String(f.situacoes.includes(x.id)));
      aplicar();
    });
    return b;
  }));

  const periodo = h("select", {}, PERIODOS.map((p) => h("option", { value: p.id, selected: p.id === f.periodo }, p.rotulo)));
  const de = h("input", { type: "date", value: f.de });
  const ate = h("input", { type: "date", value: f.ate });
  const campoDe = campo("De", de), campoAte = campo("Até", ate);
  const verIntervalo = () => { campoDe.hidden = campoAte.hidden = periodo.value !== "intervalo"; };
  periodo.addEventListener("change", () => { f.periodo = periodo.value; verIntervalo(); aplicar(); });
  de.addEventListener("change", () => { f.de = de.value; aplicar(); });
  ate.addEventListener("change", () => { f.ate = ate.value; aplicar(); });
  verIntervalo();

  const seletor = (rotulo, valor, lista, aoEscolher, vazio) => {
    if (!lista || lista.length < 2) return null;
    const sel = h("select", {}, h("option", { value: "" }, vazio),
      lista.map((x) => h("option", { value: x.id, selected: x.id === valor }, x.rotulo)));
    sel.addEventListener("change", () => { aoEscolher(sel.value); aplicar(); });
    return campo(rotulo, sel);
  };

  const limpar = h("button", { type: "button", class: "btn pequeno" }, "Limpar filtros");
  limpar.addEventListener("click", () => {
    Object.assign(f, filtroVazio());
    busca.value = ""; periodo.value = "todos"; de.value = ""; ate.value = "";
    situacoes.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    painel.querySelectorAll(".campos-filtro select").forEach((sel) => { if (sel !== periodo) sel.value = ""; });
    verIntervalo(); atualizarResumo(); aoMudar();
  });

  const resumo = h("summary", {}, "Filtros");
  const atualizarResumo = () => {
    const n = filtrosAtivos(f);
    por(resumo, "Filtros", n ? h("span", { class: "badge" }, n) : null);
  };
  atualizarResumo();
  const painel = h("details", { class: "painel-filtros", open: filtrosAtivos(f) > 0 }, resumo,
    h("div", { class: "campos-filtro" },
      campo("Situação", situacoes, { inteiro: true }),
      campo("Período da folga", periodo), campoDe, campoAte,
      seletor("Equipe", f.equipe, opts.equipes, (v) => { f.equipe = v; }, "Todas as equipes"),
      seletor("Gestor", f.gestor, opts.gestores, (v) => { f.gestor = v; }, "Todos os gestores")),
    h("div", { class: "acoes" }, limpar));
  return h("div", { class: "busca-e-filtros" }, busca, painel);
}

/** Lista com "Mostrar mais": evita desenhar centenas de cartões de uma vez. */
function listaComMais(lista, f, aoMudar, montar) {
  const visiveis = lista.slice(0, f.mostrar);
  const restam = lista.length - visiveis.length;
  return [
    h("p", { class: "sub contagem" }, lista.length === 0 ? "Nenhum resultado"
      : lista.length === 1 ? "1 revezamento" : `${lista.length} revezamentos` + (restam ? ` · mostrando ${visiveis.length}` : "")),
    montar(visiveis),
    restam > 0 && h("button", { class: "btn bloco", onClick: () => { f.mostrar += 20; aoMudar(); } },
      `Mostrar mais (${restam > 20 ? 20 : restam})`),
  ];
}

/* ---------- 6.3 Central de notificações ---------- */
function telaNotificacoes(perfil) {
  const main = tela({ titulo: "Notificações", sub: "Avisos dos seus revezamentos", voltar: () => ir("/"), perfil, menu: menuDe(perfil, "/"), abas: false });
  const area = h("div", { class: "pilha" });
  mais(main, area);

  const desenhar = () => {
    const lidas = Notificacoes.lidas();
    const lista = Notificacoes.lista;
    if (!lista.length) {
      return por(area, h("div", { class: "cartao vazio" }, h("b", {}, "Nenhuma notificação"),
        "Os avisos sobre os seus revezamentos aparecem aqui."));
    }
    por(area, h("div", { class: "pilha avisos" }, lista.map((n) => h("a", {
      class: "item aviso-item" + (lidas[n.chave] ? "" : " nao-lida"), href: "#/t/" + n.id,
    }, h("div", { class: "aviso-txt" }, h("p", {}, n.texto),
        h("span", { class: "sub" }, n.detalhe), h("span", { class: "sub" }, quandoRelativo(n.ms))),
      h("span", { class: "aviso-acao" }, n.acao)))));
  };
  desenhar.elemento = area;
  Notificacoes.aoMudar(desenhar);
  // abrir a central marca tudo como lido
  setTimeout(() => Notificacoes.marcarTodasLidas(), 1200);
}

/* ---------- 6.4 Colaborador ---------- */
let filtroMeus = filtroVazio();

function telaInicioColaborador(perfil) {
  const main = tela({
    titulo: primeiroNome(perfil.nome),
    sub: `Matrícula ${perfil.matricula}${perfil.equipe ? " · Equipe " + perfil.equipe : ""}`,
    perfil, menu: menuDe(perfil, "/"), abas: false,
    acao: perfil.gestorUid ? { rotulo: "+ Novo revezamento", onClick: () => ir("/nova") } : null,
  });
  if (!perfil.gestorUid) mais(main, aviso("atencao", "Seu cadastro ainda não está ligado a um gestor. Procure o RH para poder pedir revezamentos."));
  const area = h("div", { class: "pilha" }, carregando());
  mais(main, area);

  const item = (t) => {
    const outro = t.solicitanteUid === perfil.uid ? t.parceiro : t.solicitante;
    return h("a", { class: "item", href: "#/t/" + t.id },
      h("div", { class: "item-topo" }, h("b", {}, outro ? "Com " + primeiroNome(outro.nome) : "Aguardando um colega"), etiqueta(situacaoDe(t))),
      parDeFolgas(t, perfil.uid));
  };

  guardar(Banco.ouvirTrocas(perfil, (trocas) => {
    const aberta = (t) => !expirada(t) && (t.etapa === "aguardando_parceiro" || t.etapa === "aguardando_gestor" || t.etapa === "aprovada");
    const ativas = trocas.filter(aberta);
    const anteriores = trocas.filter((t) => !aberta(t));
    if (trocas.length === 0) {
      return por(area, h("div", { class: "cartao vazio" }, h("b", {}, "Nenhum revezamento ainda"),
        "Toque em ", h("strong", {}, "Novo revezamento"), ", escolha o dia da sua folga e envie o link para o colega que vai trabalhar no seu lugar."));
    }
    por(area,
      h("div", { class: "secao" }, "Em andamento"),
      ativas.length ? h("div", { class: "grade" }, ativas.map(item))
        : h("div", { class: "cartao vazio" }, h("b", {}, "Nenhum revezamento em andamento"), "Seus pedidos anteriores aparecem na busca abaixo."),
      anteriores.length > 0 && busca(anteriores));
  }, () => por(area, aviso("erro", "Não foi possível carregar seus revezamentos."))));

  /** Revezamentos anteriores: a lista só aparece quando há busca ou filtro. */
  function busca(lista) {
    const f = filtroMeus;
    const caixa = h("div", { class: "pilha" });
    const atualizar = () => {
      if (!temFiltro(f)) {
        return por(caixa, h("p", { class: "sub contagem" },
          `Você tem ${lista.length} ${lista.length === 1 ? "revezamento anterior" : "revezamentos anteriores"}. Busque ou use os filtros para vê-los.`));
      }
      const r = filtrarTrocas(lista, f);
      por(caixa, r.length ? listaComMais(r, f, atualizar, (v) => h("div", { class: "grade" }, v.map(item)))
        : h("p", { class: "sub contagem" }, "Nenhum resultado com esses filtros."));
    };
    atualizar();
    return h("div", { class: "pilha" }, h("div", { class: "secao" }, "Anteriores"),
      painelFiltros(f, { equipes: [], gestores: [] }, atualizar), caixa);
  }
}

function telaNovaTroca(perfil) {
  const main = tela({ titulo: "Novo revezamento", sub: "Escolha o dia da sua folga", voltar: () => ir("/"), perfil, menu: menuDe(perfil, "/nova"), abas: false });
  if (!perfil.gestorUid) return mais(main, aviso("atencao", "Seu cadastro ainda não está ligado a um gestor. Procure o RH."));

  const data = h("input", { type: "date", min: hojeISO() });
  const entrada = h("input", { value: perfil.entrada || "", placeholder: "6h" });
  const saida = h("input", { value: perfil.saida || "", placeholder: "18h" });
  const obs = h("textarea", { maxLength: 300, placeholder: "Algum detalhe para o gestor" });
  const colega = h("select", {}, h("option", { value: "" }, "Carregando colegas…"));
  const prazo = h("select", {},
    h("option", { value: "vespera" }, "Até a véspera da folga"),
    h("option", { value: "3" }, "Em 3 dias"),
    h("option", { value: "7" }, "Em 7 dias"),
    h("option", { value: "" }, "Sem prazo"));
  const erro = caixaErro();
  const alertas = h("div", {});
  const botao = h("button", { class: "btn primario bloco" }, "Criar e enviar convite");

  let colegas = [];
  let minhasTrocas = [];
  guardar(Banco.ouvirColegas(perfil, (lista) => {
    colegas = lista;
    const atual = colega.value;
    por(colega, h("option", { value: "" }, "Qualquer colega com o link"),
      lista.map((c) => h("option", { value: c.uid }, `${c.nome} — mat. ${c.matricula}${c.equipe ? " · equipe " + c.equipe : ""}`)));
    colega.value = atual;
  }, () => por(colega, h("option", { value: "" }, "Qualquer colega com o link"))));
  guardar(Banco.ouvirTrocas(perfil, (t) => { minhasTrocas = t; conferir(); }, () => {}));

  /** Mostra os avisos das regras já na hora de preencher. */
  function conferir() {
    if (!data.value) return por(alertas);
    const escolhido = colegas.find((c) => c.uid === colega.value);
    const previa = {
      id: "nova",
      etapa: "aguardando_gestor",
      solicitanteUid: perfil.uid,
      solicitante: { ...perfil, entrada: entrada.value, saida: saida.value },
      dataFolgaSolicitante: data.value,
      parceiroUid: escolhido ? escolhido.uid : null,
      parceiro: escolhido || null,
      dataFolgaParceiro: null,
      gestores: [perfil.gestorUid],
    };
    por(alertas, caixaConflitos(conflitosDaTroca(previa, minhasTrocas), "Confira antes de enviar"));
  }
  [data, entrada, saida].forEach((el) => el.addEventListener("change", conferir));
  colega.addEventListener("change", conferir);

  const form = h("form", { class: "cartao pilha form-largo", novalidate: true },
    h("p", { class: "sub" }, "No dia da sua folga, o colega trabalha no seu lugar. Depois ele escolhe o dia da folga dele, e nesse dia você trabalha no lugar dele."),
    h("div", { class: "campos" },
      campo("Dia da minha folga", data, { inteiro: true }),
      campo("Entrada", entrada, { ajuda: "Seu horário nesse dia" }), campo("Saída", saida),
      campo("Convidar", colega, { inteiro: true, ajuda: "Escolhendo o colega, só ele consegue aceitar o convite." }),
      campo("Prazo para responder", prazo, { inteiro: true, ajuda: "Depois do prazo o convite não pode mais ser aceito." }),
      campo("Observação (opcional)", obs, { inteiro: true })),
    alertas, erro, botao);
  mais(main, form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!data.value) return erro.mostrar("Escolha o dia da sua folga.");
    if (data.value < hojeISO()) return erro.mostrar("O dia da folga não pode estar no passado.");
    const escolhido = colegas.find((c) => c.uid === colega.value) || null;
    erro.mostrar(""); botao.disabled = true; botao.textContent = "Criando…";
    try {
      const id = await Banco.criarTroca(perfil, {
        dataFolga: data.value, entrada: entrada.value, saida: saida.value, observacao: obs.value,
        colega: escolhido, expiraEm: prazoEm(prazo.value, data.value),
      });
      toast(escolhido ? "Convite criado. Avise o colega pelo link." : "Pedido criado. Agora envie o link ao colega.");
      ir("/t/" + id);
    } catch (err) { erro.mostrar(mensagemErro(err)); botao.disabled = false; botao.textContent = "Criar e enviar convite"; }
  });
}

/** Data-limite para aceitar o convite, como data e hora do banco. */
function prazoEm(opcao, dataFolga) {
  if (!opcao) return null;
  const dia = opcao === "vespera" ? somarDias(dataFolga, -1) : somarDias(hojeISO(), Number(opcao));
  const limite = opcao === "vespera" && dia < hojeISO() ? dataFolga : dia;
  const [a, m, d] = limite.split("-").map(Number);
  return firebase.firestore.Timestamp.fromDate(new Date(a, m - 1, d, 23, 59, 59));
}

/** O convite venceu? */
function expirada(t) {
  return t.etapa === "aguardando_parceiro" && t.expiraEm && t.expiraEm.toMillis && t.expiraEm.toMillis() < Date.now();
}

/* ---------- 6.5 Detalhe do revezamento (convite, aprovação, PDF) ---------- */
function telaTroca(perfil, id) {
  const base = { perfil, menu: menuDe(perfil, "/t/"), abas: false, voltar: () => ir("/") };
  let main = tela({ ...base, titulo: "Revezamento" });
  mais(main, carregando());
  // o que foi digitado sobrevive às atualizações em tempo real
  let listaDeTrocas = [];
  guardar(Banco.ouvirTrocas(perfil, (t) => { listaDeTrocas = t; }, () => {}));
  const memoria = { dataFolga: "", entrada: perfil.entrada || "", saida: perfil.saida || "", recusando: false, motivo: "", confirmarCancelar: false, confirmarConcluir: false };

  guardar(Banco.ouvirTroca(id, desenhar, () => desenhar(null)));

  function desenhar(troca) {
    if (!troca) {
      main = tela({ ...base, titulo: "Revezamento" });
      return mais(main, aviso("atencao", "Este pedido não foi encontrado ou você não tem acesso a ele. Se recebeu o link de um colega, ele pode já ter sido aceito por outra pessoa ou cancelado."));
    }
    const souSolicitante = troca.solicitanteUid === perfil.uid;
    const souParceiro = troca.parceiroUid === perfil.uid;
    const souGestor = perfil.papel === "gestor" && troca.gestores.includes(perfil.uid);
    const souConvidado = !troca.convidadoUid || troca.convidadoUid === perfil.uid;
    const ehConvite = !souSolicitante && !souParceiro && perfil.papel === "colaborador"
      && troca.etapa === "aguardando_parceiro" && !expirada(troca) && souConvidado;
    const erro = caixaErro();
    main = tela({ ...base, titulo: ehConvite ? "Convite de revezamento" : "Revezamento", sub: "Pedido de " + primeiroNome(troca.solicitante.nome), direita: etiqueta(situacaoDe(troca)) });

    if (ehConvite) return mais(main, erro, h("div", { class: "form-largo pilha" }, convite(troca, erro)));
    if (!souSolicitante && !souParceiro && perfil.papel === "colaborador") {
      // alguém abriu o link, mas o convite não é para essa pessoa, já venceu ou já foi aceito
      return mais(main, aviso("atencao", expirada(troca) ? "O prazo deste convite venceu."
        : !souConvidado ? `Este convite é para ${primeiroNome((troca.convidado || {}).nome || "outro colega")}.`
        : "Este convite já foi aceito por outra pessoa ou foi cancelado."));
    }

    const ativa = troca.etapa === "aguardando_parceiro" || troca.etapa === "aguardando_gestor";
    const esquerda = h("div", { class: "pilha" },
      h("div", { class: "cartao pilha" }, parDeFolgas(troca, perfil.uid), pessoas(troca),
        troca.convidado && troca.etapa === "aguardando_parceiro" &&
          h("p", { class: "sub" }, h("b", {}, "Convite enviado a: "), `${troca.convidado.nome} (mat. ${troca.convidado.matricula})`),
        troca.expiraEm && troca.etapa === "aguardando_parceiro" &&
          h("p", { class: "sub" }, h("b", {}, expirada(troca) ? "Prazo venceu em: " : "Prazo para responder: "), quando(troca.expiraEm)),
        troca.observacao && h("p", { class: "sub" }, h("b", {}, "Observação: "), troca.observacao)),
      caixaConflitos(conflitosDaTroca(troca, listaDeTrocas), souGestor || perfil.papel === "admin" ? "Confira antes de aprovar" : null),
      andamento(troca));
    const direita = h("div", { class: "pilha" },
      souSolicitante && troca.etapa === "aguardando_parceiro" && compartilhar(troca),
      souGestor && troca.etapa === "aguardando_gestor" && !(troca.aprovacoes || {})[perfil.uid] && decisao(troca, erro),
      troca.parceiro && troca.etapa !== "cancelada" && (souGestor || perfil.papel === "admin" || troca.etapa === "aprovada" || troca.etapa === "concluida") && botaoPdf(troca, erro),
      (souGestor || perfil.papel === "admin") && troca.etapa === "aprovada" && concluir(troca, erro),
      souSolicitante && ativa && cancelar(troca, erro),
      (souSolicitante || souParceiro) && situacao(troca));
    mais(main, erro, h("div", { class: "detalhe" }, esquerda, direita));
  }

  function situacao(troca) {
    const msgs = {
      aguardando_gestor: ["", "O revezamento foi combinado e está com o gestor para aprovação."],
      aprovada: ["ok", "Revezamento aprovado. O gestor gera o documento oficial e marca como concluído."],
      concluida: ["ok", "Revezamento concluído."],
      recusada: ["erro", "O revezamento foi recusado pelo gestor."],
      cancelada: ["", "Este pedido foi cancelado."],
    };
    const m = msgs[troca.etapa];
    return m ? aviso(m[0], m[1]) : null;
  }

  function pessoas(troca) {
    const linha = (p, papel) => p && h("div", { class: "pessoa" }, iniciais(p.nome),
      h("div", { style: { minWidth: 0 } }, h("div", { class: "nome" }, p.nome),
        h("div", { class: "meta" }, `${papel} · Mat. ${p.matricula}${p.equipe ? " · Equipe " + p.equipe : ""} · Gestor: ${primeiroNome(p.gestorNome)}`)));
    return h("div", { class: "pilha", style: { gap: "12px" } }, linha(troca.solicitante, "Solicitante"), linha(troca.parceiro, "Colega"));
  }

  function andamento(troca) {
    if (troca.etapa === "aguardando_parceiro" || troca.etapa === "cancelada") return null;
    const nomes = {};
    nomes[troca.solicitante.gestorUid] = troca.solicitante.gestorNome;
    if (troca.parceiro) nomes[troca.parceiro.gestorUid] = troca.parceiro.gestorNome;
    const ap = troca.aprovacoes || {};
    return h("div", { class: "cartao pilha", style: { gap: "10px" } },
      h("h2", {}, "Aprovação"),
      troca.gestores.length > 1 && h("p", { class: "sub" }, "Os colaboradores são de equipes diferentes: os dois gestores precisam aprovar."),
      troca.gestores.map((g) => {
        const a = ap[g];
        return h("div", { class: "pessoa" }, iniciais(nomes[g] || (a && a.nome)),
          h("div", { style: { flex: 1, minWidth: 0 } },
            h("div", { class: "nome" }, nomes[g] || (a && a.nome) || "Gestor"),
            h("div", { class: "meta" }, a ? `${a.decisao === "aprovada" ? "Aprovou" : "Recusou"} em ${quando(a.em)}` : "Ainda não decidiu"),
            a && a.motivo && h("div", { class: "meta" }, "Motivo: " + a.motivo)),
          etiqueta(a ? a.decisao : "pendente"));
      }),
      troca.concluidaPor && h("div", { class: "pessoa" }, iniciais(troca.concluidaPor.nome),
        h("div", { style: { flex: 1, minWidth: 0 } }, h("div", { class: "nome" }, troca.concluidaPor.nome),
          h("div", { class: "meta" }, "Marcou como concluída em " + quando(troca.concluidaPor.em))),
        etiqueta("concluida")));
  }

  function compartilhar(troca) {
    const link = linkDaTroca(troca.id);
    const texto = `Olá! Quero fazer um revezamento de escala com você. Eu folgo dia ${dataBR(troca.dataFolgaSolicitante)} (${diaSemana(troca.dataFolgaSolicitante)}) e você trabalha no meu lugar. Abra o link para aceitar e escolher o dia da sua folga:`;
    const copiar = () => navigator.clipboard.writeText(link).then(() => toast("Link copiado."), () => toast("Não foi possível copiar. Selecione o link e copie."));
    return h("div", { class: "cartao pilha", style: { gap: "10px" } },
      h("h2", {}, "Envie para o colega"),
      h("p", { class: "sub" }, "Mande este link para quem vai trabalhar no seu lugar. Ele entra com a matrícula dele, aceita e escolhe o dia da folga dele."),
      h("div", { class: "link-caixa" }, link),
      h("a", { class: "btn ok bloco", href: "https://wa.me/?text=" + encodeURIComponent(texto + " " + link), target: "_blank", rel: "noreferrer" }, "Enviar pelo WhatsApp"),
      h("div", { class: "acoes" },
        typeof navigator.share === "function" && h("button", { class: "btn", onClick: () => navigator.share({ title: "Revezamento de escala", text: texto, url: link }).catch(() => {}) }, "Compartilhar…"),
        h("button", { class: "btn", onClick: copiar }, "Copiar link")));
  }

  function convite(troca, erro) {
    const s = troca.solicitante, nome = primeiroNome(s.nome), curto = nome.split(" ")[0];
    if (!perfil.gestorUid) return aviso("atencao", "Seu cadastro ainda não está ligado a um gestor. Procure o RH antes de aceitar revezamentos.");
    const ligar = (el, k) => { el.value = memoria[k]; el.addEventListener("input", () => { memoria[k] = el.value; }); return el; };
    const data = ligar(h("input", { type: "date", min: hojeISO() }), "dataFolga");
    const entrada = ligar(h("input", { placeholder: "6h" }), "entrada");
    const saida = ligar(h("input", { placeholder: "18h" }), "saida");
    const botao = h("button", { class: "btn primario bloco" }, "Aceitar revezamento");
    const alertasConvite = h("div", {});
    const form = h("form", { class: "cartao pilha", novalidate: true },
      h("div", { class: "pessoa" }, iniciais(s.nome), h("div", {}, h("div", { class: "nome" }, s.nome), h("div", { class: "meta" }, `Mat. ${s.matricula}${s.equipe ? " · Equipe " + s.equipe : ""}`))),
      h("p", { style: { margin: 0 } }, h("b", {}, nome), " quer revezar com você. No dia ", h("b", {}, dataBR(troca.dataFolgaSolicitante)),
        ` (${diaSemana(troca.dataFolgaSolicitante)}) ${curto} folga e `, h("b", {}, "você trabalha no lugar"),
        s.entrada || s.saida ? ` (${[s.entrada, s.saida].filter(Boolean).join(" às ")})` : "", "."),
      h("p", { class: "sub" }, `Escolha o dia da sua folga. Nesse dia, ${curto} trabalha no seu lugar.`),
      troca.observacao && h("p", { class: "sub" }, h("b", {}, "Observação: "), troca.observacao),
      h("div", { class: "campos" }, campo("Dia da minha folga", data, { inteiro: true }),
        campo("Entrada", entrada, { ajuda: "Seu horário nesse dia" }), campo("Saída", saida)),
      alertasConvite, botao);
    const conferir = () => {
      if (!memoria.dataFolga) return por(alertasConvite);
      const previa = { ...troca, id: "previa", etapa: "aguardando_gestor", parceiroUid: perfil.uid,
        parceiro: { ...perfil, entrada: memoria.entrada, saida: memoria.saida }, dataFolgaParceiro: memoria.dataFolga };
      por(alertasConvite, caixaConflitos(conflitosDaTroca(previa, listaDeTrocas), "Confira antes de aceitar"));
    };
    [data, entrada, saida].forEach((el) => el.addEventListener("change", conferir));
    conferir();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!memoria.dataFolga) return erro.mostrar("Escolha o dia da sua folga.");
      if (memoria.dataFolga < hojeISO()) return erro.mostrar("O dia da folga não pode estar no passado.");
      if (memoria.dataFolga === troca.dataFolgaSolicitante) return erro.mostrar(`Sua folga precisa ser em outro dia: em ${dataBR(troca.dataFolgaSolicitante)} você vai trabalhar no lugar de ${nome}.`);
      erro.mostrar(""); botao.disabled = true; botao.textContent = "Enviando…";
      try { await Banco.aceitarTroca(troca, perfil, memoria); toast("Revezamento aceito. Agora é com o gestor."); }
      catch (err) { erro.mostrar(mensagemErro(err)); botao.disabled = false; botao.textContent = "Aceitar revezamento"; }
    });
    return form;
  }

  function decisao(troca, erro) {
    const caixa = h("div", { class: "cartao pilha", style: { gap: "12px" } });
    const decidir = async (d, botoes) => {
      if (d === "recusada" && !memoria.motivo.trim()) return erro.mostrar("Informe o motivo da recusa.");
      erro.mostrar(""); botoes.forEach((b) => { b.disabled = true; });
      try { await Banco.decidirTroca(troca, perfil, d, memoria.motivo); toast(d === "aprovada" ? "Revezamento aprovado." : "Revezamento recusado."); }
      catch (err) { erro.mostrar(mensagemErro(err)); botoes.forEach((b) => { b.disabled = false; }); }
    };
    const montar = () => {
      if (memoria.recusando) {
        const motivo = h("textarea", { maxLength: 300, value: memoria.motivo });
        motivo.addEventListener("input", () => { memoria.motivo = motivo.value; });
        const voltar = h("button", { class: "btn", onClick: () => { memoria.recusando = false; montar(); } }, "Voltar");
        const confirmar = h("button", { class: "btn perigo", onClick: () => decidir("recusada", [voltar, confirmar]) }, "Confirmar recusa");
        por(caixa, h("h2", {}, "Sua decisão"), campo("Motivo da recusa", motivo), h("div", { class: "acoes" }, voltar, confirmar));
        motivo.focus();
      } else {
        const recusar = h("button", { class: "btn perigo", onClick: () => { memoria.recusando = true; montar(); } }, "Recusar");
        const aprovar = h("button", { class: "btn ok", onClick: () => decidir("aprovada", [recusar, aprovar]) }, "Aprovar");
        por(caixa, h("h2", {}, "Sua decisão"), h("p", { class: "sub" }, "Confira as datas e os horários antes de aprovar."), h("div", { class: "acoes" }, recusar, aprovar));
      }
    };
    montar();
    return caixa;
  }

  function concluir(troca, erro) {
    const caixa = h("div", { class: "cartao pilha", style: { gap: "10px" } });
    const montar = () => {
      if (memoria.confirmarConcluir) {
        const voltar = h("button", { class: "btn", onClick: () => { memoria.confirmarConcluir = false; montar(); } }, "Voltar");
        const sim = h("button", { class: "btn ok", onClick: async () => {
          erro.mostrar(""); sim.disabled = true; voltar.disabled = true;
          try { await Banco.concluirTroca(troca, perfil); toast("Revezamento concluído."); }
          catch (err) { erro.mostrar(mensagemErro(err)); sim.disabled = false; voltar.disabled = false; }
        } }, "Sim, concluir");
        por(caixa, h("h2", {}, "Concluir revezamento"),
          h("p", { class: "sub" }, "Confirme que o documento já foi gerado, assinado e entregue ao Departamento de Pessoal."),
          h("div", { class: "acoes" }, voltar, sim));
      } else {
        por(caixa, h("h2", {}, "Concluir revezamento"),
          h("p", { class: "sub" }, "Depois de gerar o PDF e entregar o documento assinado, marque como concluído. O pedido sai da lista de pendentes."),
          h("button", { class: "btn ok bloco", onClick: () => { memoria.confirmarConcluir = true; montar(); } }, "Marcar como concluída"));
      }
    };
    montar();
    return caixa;
  }

  function cancelar(troca, erro) {
    const caixa = h("div", {});
    const montar = () => {
      if (memoria.confirmarCancelar) {
        por(caixa, h("div", { class: "cartao pilha", style: { gap: "10px" } },
          h("p", { style: { margin: 0 } }, "Cancelar este pedido de revezamento?"),
          h("div", { class: "acoes" },
            h("button", { class: "btn", onClick: () => { memoria.confirmarCancelar = false; montar(); } }, "Não"),
            h("button", { class: "btn perigo", onClick: () => Banco.cancelarTroca(troca).then(() => toast("Pedido cancelado."), (err) => erro.mostrar(mensagemErro(err))) }, "Sim, cancelar"))));
      } else {
        por(caixa, h("button", { class: "btn perigo bloco", onClick: () => { memoria.confirmarCancelar = true; montar(); } }, "Cancelar pedido"));
      }
    };
    montar();
    return caixa;
  }
}

/* ---------- 6.6 Calendário da equipe ---------- */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_CURTOS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Grade do mês com as folgas e coberturas. Devolve o elemento pronto. */
function calendario(trocas, aoAbrirTroca) {
  const hoje = hojeISO();
  let mes = Number(hoje.slice(5, 7)) - 1, ano = Number(hoje.slice(0, 4));
  let diaAberto = hoje;
  const caixa = h("div", { class: "pilha" });

  const porDia = () => {
    const mapa = {};
    trocas.filter((t) => ETAPAS_VALEM.includes(t.etapa) && !expirada(t)).forEach((t) => {
      diasDaTroca(t).forEach((d) => {
        if (!d.folga) return;
        (mapa[d.data] = mapa[d.data] || []).push({
          troca: t, folga: d.folga.p, trabalha: d.trabalha ? d.trabalha.p : null, etapa: t.etapa,
        });
      });
    });
    return mapa;
  };

  function montar() {
    const mapa = porDia();
    const primeiro = new Date(ano, mes, 1);
    const inicio = primeiro.getDay();
    const total = new Date(ano, mes + 1, 0).getDate();
    const iso = (d) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    const celulas = [];
    for (let i = 0; i < inicio; i++) celulas.push(h("div", { class: "cel vazia" }));
    for (let d = 1; d <= total; d++) {
      const data = iso(d), eventos = mapa[data] || [];
      const cel = h("button", {
        type: "button",
        class: "cel" + (data === hoje ? " hoje" : "") + (data === diaAberto ? " aberta" : "") + (eventos.length ? " tem" : ""),
        onClick: () => { diaAberto = data; montar(); },
      }, h("span", { class: "num" }, d),
        eventos.length ? h("span", { class: "pontos" }, eventos.slice(0, 3).map(() => h("i", {}))) : null);
      celulas.push(cel);
    }

    const titulo = h("div", { class: "cal-topo" },
      h("button", { class: "btn pequeno", type: "button", onClick: () => { mes--; if (mes < 0) { mes = 11; ano--; } montar(); } }, "‹"),
      h("b", {}, `${MESES[mes].charAt(0).toUpperCase() + MESES[mes].slice(1)} de ${ano}`),
      h("button", { class: "btn pequeno", type: "button", onClick: () => { mes++; if (mes > 11) { mes = 0; ano++; } montar(); } }, "›"));

    const eventosDoDia = mapa[diaAberto] || [];
    const detalhe = h("div", { class: "cartao pilha", style: { gap: "10px" } },
      h("h2", {}, dataBR(diaAberto) + " · " + diaSemana(diaAberto)),
      eventosDoDia.length
        ? h("div", { class: "pilha", style: { gap: "8px" } }, eventosDoDia.map((e) => h("button", {
            class: "linha-dia", type: "button", onClick: () => aoAbrirTroca(e.troca.id),
          }, iniciais(e.folga.nome),
            h("div", { class: "linha-txt" },
              h("b", {}, primeiroNome(e.folga.nome) + " folga"),
              h("span", { class: "sub" }, e.trabalha ? "Cobre: " + primeiroNome(e.trabalha.nome) : "Cobertura a definir")),
            etiqueta(e.etapa))))
        : h("p", { class: "sub" }, "Ninguém folga por revezamento neste dia."));

    por(caixa, h("div", { class: "cartao pilha", style: { gap: "10px" } }, titulo,
      h("div", { class: "cal-grade" }, DIAS_CURTOS.map((x, i) => h("span", { class: "cab-dia", key: i }, x)), celulas)), detalhe);
  }
  montar();
  return caixa;
}

/* ---------- 6.7 Gestor e RH: pendentes, todas as trocas, equipe ---------- */
// Guardado fora da função para o gestor não perder os filtros ao abrir uma troca e voltar.
let filtroTrocas = filtroVazio();
let filtroPendentes = filtroVazio();

function telaInicioGestor(perfil, rota) {
  const ehAdmin = perfil.papel === "admin";
  const aba = rota === "/equipe" ? "equipe" : rota === "/trocas" ? "trocas" : rota === "/calendario" ? "calendario" : "pendentes";
  const titulos = {
    pendentes: ["Pendentes", ehAdmin ? "Aprovados esperando conclusão" : "Para decidir ou concluir"],
    trocas: ["Todas as trocas", ehAdmin ? "Todas as equipes" : "Revezamentos da sua equipe"],
    equipe: [ehAdmin ? "Usuários" : "Minha equipe", ehAdmin ? "Gestores, colaboradores e RH" : "Colaboradores ligados a você"],
    calendario: ["Calendário", ehAdmin ? "Folgas de todas as equipes" : "Folgas e coberturas da sua equipe"],
  };
  const estado = { trocas: null, usuarios: null, buscaEquipe: "", papel: "todos" };
  // Pendentes = o que precisa de ação sua: decidir (só o gestor) ou concluir o que já foi aprovado (gestor e RH)
  const pendentesDe = (lista) => (lista || []).filter((t) => t.etapa === "aprovada" ||
    (!ehAdmin && t.etapa === "aguardando_gestor" && !(t.aprovacoes || {})[perfil.uid]));
  const temConflito = (t) => conflitosDaTroca(t, estado.trocas || []).some((x) => x.nivel === "alerta");
  let main;

  function montar() {
    main = tela({
      titulo: titulos[aba][0],
      sub: `${titulos[aba][1]} · ${primeiroNome(perfil.nome)} (${ehAdmin ? "RH" : "gestor"})`,
      perfil, menu: menuDe(perfil, rota, pendentesDe(estado.trocas).length),
      acao: aba === "equipe" ? { rotulo: "+ Cadastrar", onClick: () => ir("/usuario/novo") } : null,
    });
    preencher();
  }

  function preencher() {
    if (aba === "equipe") return por(main, equipe());
    if (estado.trocas === null) return por(main, carregando());
    if (aba === "calendario") return por(main, calendario(estado.trocas, (id) => ir("/t/" + id)));
    if (aba === "pendentes") return por(main, pendentes());
    por(main, todas());
  }

  /** Seleção para baixar vários PDFs de uma vez. */
  const selecao = new Set();
  const podeEntrarNoLote = (t) => t.parceiro && t.etapa !== "cancelada" && t.etapa !== "recusada";

  function barraLote(lista) {
    const podem = lista.filter(podeEntrarNoLote);
    if (podem.length < 2) return null;
    const barra = h("div", { class: "barra-lote" });
    barra.atualizar = () => {
      const marcados = podem.filter((t) => selecao.has(t.id));
      const todos = h("button", { class: "btn pequeno", type: "button",
        onClick: () => {
          const ligar = marcados.length < podem.length;
          podem.forEach((t) => (ligar ? selecao.add(t.id) : selecao.delete(t.id)));
          main.querySelectorAll(".marcar input").forEach((c) => { c.checked = selecao.has(c.dataset.troca); });
          barra.atualizar();
        } }, marcados.length < podem.length ? "Marcar todos" : "Desmarcar todos");
      if (!marcados.length) return por(barra, h("span", { class: "sub" }, "Marque os revezamentos para baixar os PDFs juntos."), todos);
      const baixar = h("button", { class: "btn primario pequeno", type: "button" }, `Baixar ${marcados.length} em um PDF`);
      baixar.addEventListener("click", async () => {
        baixar.disabled = true; baixar.textContent = "Gerando…";
        try { await Pdf.baixar(marcados); toast(`PDF com ${marcados.length} revezamentos gerado.`); }
        catch (err) { toast("Não foi possível gerar: " + (err.message || err)); }
        finally { barra.atualizar(); }
      });
      por(barra, h("span", { class: "sub" }, `${marcados.length} marcados`), todos, baixar);
    };
    barra.atualizar();
    barraAtual = barra;
    return barra;
  }
  let barraAtual = null;

  function grade(lista) {
    return h("div", { class: "grade" }, lista.map((t) => h("a", { class: "item", href: "#/t/" + t.id },
      h("div", { class: "item-topo" }, h("b", {}, primeiroNome(t.solicitante.nome) + (t.parceiro ? " ⇄ " + primeiroNome(t.parceiro.nome) : "")), etiqueta(situacaoDe(t))),
      parDeFolgas(t),
      t.etapa === "aguardando_gestor" && temConflito(t) && h("p", { class: "marca-conflito" }, "⚠ Confira as regras da escala"),
      h("div", { class: "item-rodape" }, h("span", { class: "sub" }, "Pedido em " + quando(t.criadoEm)),
        podeEntrarNoLote(t) && h("label", {
          class: "marcar", onClick: (e) => { e.stopPropagation(); },
        }, h("input", { type: "checkbox", checked: selecao.has(t.id), "data-troca": t.id,
          onChange: (e) => {
            if (e.target.checked) selecao.add(t.id); else selecao.delete(t.id);
            if (barraAtual) barraAtual.atualizar();
          } }), "PDF em lote"),
        t.parceiro && t.etapa !== "cancelada" && botaoPdf(t, null, true)))));
  }

  /** Equipes e gestores que aparecem nas trocas carregadas, para montar os seletores. */
  function opcoesDasTrocas() {
    const equipes = new Set(), gestores = new Map();
    estado.trocas.forEach((t) => [t.solicitante, t.parceiro].filter(Boolean).forEach((p) => {
      if (p.equipe) equipes.add(p.equipe);
      if (p.gestorUid) gestores.set(p.gestorUid, primeiroNome(p.gestorNome));
    }));
    return {
      equipes: [...equipes].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((e) => ({ id: e, rotulo: "Equipe " + e })),
      gestores: ehAdmin ? [...gestores].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([id, rotulo]) => ({ id, rotulo })) : [],
    };
  }

  /** Primeira tela: só o que precisa de ação. Os demais aparecem quando se busca ou filtra. */
  function pendentes() {
    const lista = pendentesDe(estado.trocas);
    const f = filtroPendentes;
    const caixa = h("div", { class: "pilha" });
    const outros = estado.trocas.filter((t) => !lista.includes(t));
    const atualizar = () => {
      if (!temFiltro(f)) {
        return por(caixa, h("p", { class: "sub contagem" },
          outros.length ? `Há ${outros.length} ${outros.length === 1 ? "outro revezamento" : "outros revezamentos"}. Busque ou use os filtros para vê-los.`
            : "Nenhum outro revezamento registrado."));
      }
      const r = filtrarTrocas(outros, f);
      por(caixa, r.length ? listaComMais(r, f, atualizar, grade)
        : h("p", { class: "sub contagem" }, "Nenhum resultado com esses filtros."));
    };
    atualizar();
    return [
      h("div", { class: "secao" }, lista.length ? `Para resolver (${lista.length})` : "Para resolver"),
      barraLote(lista),
      lista.length ? grade(lista)
        : h("div", { class: "cartao vazio" }, h("b", {}, "Nada pendente"), "Quando houver um revezamento para aprovar ou concluir, ele aparece aqui."),
      outros.length > 0 && h("div", { class: "secao" }, "Buscar nos demais"),
      outros.length > 0 && painelFiltros(f, opcoesDasTrocas(), atualizar),
      caixa,
    ];
  }

  function todas() {
    const f = filtroTrocas;
    const resultado = h("div", { class: "pilha" });
    const atualizar = () => {
      const lista = filtrarTrocas(estado.trocas, f);
      por(resultado, lista.length
        ? [barraLote(lista), listaComMais(lista, f, atualizar, grade)]
        : h("div", { class: "cartao vazio" }, h("b", {}, "Nenhum revezamento"), "Nada encontrado com esses filtros. Tente limpar a busca ou escolher outro período."));
    };
    atualizar();
    return [painelFiltros(f, opcoesDasTrocas(), atualizar), resultado];
  }

  function equipe() {
    if (estado.usuarios === null) return carregando();
    if (estado.usuarios.length === 0) {
      return h("div", { class: "cartao vazio" }, h("b", {}, "Ninguém cadastrado ainda"), "Use ", h("strong", {}, "Cadastrar"),
        ` para incluir ${ehAdmin ? "gestores e colaboradores" : "os colaboradores da sua equipe"}.`);
    }
    const busca = h("input", { type: "search", placeholder: "Buscar por nome, matrícula ou gestor", value: estado.buscaEquipe });
    const corpo = h("tbody", {});
    const contagem = h("p", { class: "sub contagem" });
    const atualizar = () => {
      const b = estado.buscaEquipe.trim().toUpperCase();
      const lista = estado.usuarios.filter((u) => (estado.papel === "todos" || u.papel === estado.papel) &&
        (!b || u.nome.includes(b) || u.matricula.toUpperCase().includes(b) || String(u.gestorNome || "").includes(b)));
      contagem.textContent = lista.length === 1 ? "1 pessoa" : `${lista.length} pessoas`;
      if (!lista.length) return por(corpo, h("tr", {}, h("td", { colspan: "8", style: { padding: "20px", textAlign: "center" } }, "Ninguém encontrado.")));
      por(corpo, lista.map((u) => {
        const ehColab = u.papel === "colaborador";
        const resumo = ["Mat. " + u.matricula, ehAdmin && PAPEIS[u.papel], u.equipe && "Equipe " + u.equipe,
          ehAdmin && ehColab && "Gestor: " + (u.gestorNome ? primeiroNome(u.gestorNome) : "—")].filter(Boolean).join(" · ");
        const tr = h("tr", { tabindex: "0" },
          h("td", { class: "c-avatar" }, iniciais(u.nome)),
          h("td", { class: "c-nome" }, u.nome),
          h("td", { class: "c-resumo" }, resumo),
          h("td", { class: "c-mat" }, u.matricula),
          ehAdmin && h("td", { class: "c-papel" }, PAPEIS[u.papel]),
          h("td", { class: "c-equipe" + (u.equipe ? "" : " vazia") }, u.equipe || "—"),
          ehAdmin && h("td", { class: "c-gestor" + (ehColab ? "" : " vazia") }, ehColab ? (u.gestorNome ? primeiroNome(u.gestorNome) : "sem gestor") : "—"),
          h("td", { class: "c-sit" }, h("span", { class: "etiqueta " + (u.ativo ? "ok" : "neutro") }, u.ativo ? "Ativo" : "Inativo")));
        tr.addEventListener("click", () => ir("/usuario/" + u.uid));
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") ir("/usuario/" + u.uid); });
        return tr;
      }));
    };
    let debounce;
    busca.addEventListener("input", () => { estado.buscaEquipe = busca.value; clearTimeout(debounce); debounce = setTimeout(atualizar, 200); });
    const filtrosPapel = ehAdmin && h("div", { class: "filtros" },
      [["todos", "Todos"], ["colaborador", "Colaborador"], ["gestor", "Gestor"], ["admin", "RH / Administrador"]].map(([id, rotulo]) => {
        const b = h("button", { type: "button", "aria-pressed": String(estado.papel === id) }, rotulo);
        b.addEventListener("click", () => {
          estado.papel = id;
          filtrosPapel.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          atualizar();
        });
        return b;
      }));
    atualizar();
    const cab = h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, "Nome"), h("th", { class: "c-resumo" }, ""), h("th", {}, "Matrícula"),
      ehAdmin && h("th", {}, "Perfil"), h("th", {}, "Equipe"), ehAdmin && h("th", {}, "Gestor"), h("th", {}, "Situação")));
    return [h("div", { class: "busca-e-filtros" }, busca, filtrosPapel), contagem, h("table", { class: "tabela" }, cab, corpo)];
  }

  montar();
  // A lista de trocas só é buscada nas abas que a usam: na aba Equipe, nada de trocas é baixado.
  if (aba !== "equipe") {
    guardar(Banco.ouvirTrocas(perfil, (t) => {
      const antes = pendentesDe(estado.trocas).length;
      estado.trocas = t;
      if (pendentesDe(t).length !== antes) montar(); else preencher();
    }, () => por(main, aviso("erro", "Não foi possível carregar os revezamentos."))));
  } else {
    guardar(Banco.ouvirUsuarios(perfil, (u) => { estado.usuarios = u; preencher(); },
      () => por(main, aviso("erro", "Não foi possível carregar os cadastros."))));
  }
}

/* ---------- 6.8 Cadastro e edição de usuários ---------- */
function telaUsuario(perfil, uidAlvo) {
  const ehAdmin = perfil.papel === "admin";
  const novo = uidAlvo === "novo";
  const voltar = () => ir("/equipe");
  const base = { perfil, menu: menuDe(perfil, "/equipe"), abas: false, voltar };
  let main = tela({ ...base, titulo: novo ? "Cadastrar" : "Cadastro" });
  mais(main, carregando());
  let feito = false;
  // carrega a lista uma vez e monta o formulário (não apaga o que está sendo digitado)
  const parar = Banco.ouvirUsuarios(perfil, (usuarios) => {
    if (feito) return;
    feito = true;
    formulario(usuarios);
  }, () => por(main, aviso("erro", "Não foi possível carregar os cadastros.")));
  guardar(parar);

  function formulario(usuarios) {
    const usuario = novo ? null : usuarios.find((u) => u.uid === uidAlvo);
    if (!novo && !usuario) return por(main, aviso("atencao", "Cadastro não encontrado ou fora da sua equipe."));
    const gestores = usuarios.filter((u) => u.papel === "gestor" && u.ativo);
    const podeEditar = ehAdmin || novo || (usuario.papel === "colaborador" && usuario.gestorUid === perfil.uid);
    const empresaInicial = (usuario && usuario.empresa) || "BIANCOGRES";
    const outraEmpresa = !EMPRESAS.includes(empresaInicial);
    const v = (k) => (usuario && usuario[k]) || "";

    main = tela({ ...base, titulo: novo ? "Cadastrar" : "Cadastro", sub: novo ? (ehAdmin ? "Novo usuário" : "Novo colaborador da sua equipe") : usuario.nome });

    const nome = h("input", { value: v("nome") });
    const matricula = h("input", { value: v("matricula"), inputmode: "numeric", readOnly: !novo });
    const equipe = h("input", { value: v("equipe"), placeholder: "Ex.: 3" });
    const empresa = h("select", {}, EMPRESAS.map((x) => h("option", { value: x, selected: x === empresaInicial }, x)),
      h("option", { value: "OUTRA", selected: outraEmpresa }, "Outra"));
    const empresaOutra = h("input", { value: outraEmpresa ? empresaInicial : "" });
    const campoOutra = campo("Nome da empresa", empresaOutra, { inteiro: true });
    const papel = h("select", {}, Object.entries(PAPEIS).map(([k, r]) => h("option", { value: k, selected: k === (v("papel") || "colaborador") }, r)));
    const gestor = h("select", {}, h("option", { value: "" }, "Escolha o gestor"),
      gestores.map((g) => h("option", { value: g.uid, selected: g.uid === v("gestorUid") }, g.nome)));
    const campoGestor = campo("Gestor", gestor, { inteiro: true, ajuda: gestores.length ? "" : "Cadastre primeiro um usuário com perfil Gestor." });
    const entrada = h("input", { value: v("entrada"), placeholder: "6h" });
    const saida = h("input", { value: v("saida"), placeholder: "18h" });
    const horario = h("input", { value: v("horario"), placeholder: "06H AS 18H" });
    const senha = h("input", { value: novo ? senhaAleatoria() : "", autocomplete: "off" });
    const ativo = h("input", { type: "checkbox", checked: usuario ? usuario.ativo !== false : true });
    const erro = caixaErro();
    const botao = h("button", { class: "btn primario bloco" }, novo ? "Cadastrar" : "Salvar alterações");

    // sugere o horário a partir da entrada e da saída, enquanto não for digitado outro
    let sugestao = horarioDe(entrada.value, saida.value);
    const sugerir = () => {
      if (!horario.value || horario.value === sugestao) horario.value = horarioDe(entrada.value, saida.value);
      sugestao = horarioDe(entrada.value, saida.value);
    };
    entrada.addEventListener("input", sugerir);
    saida.addEventListener("input", sugerir);
    const visibilidade = () => {
      campoOutra.hidden = empresa.value !== "OUTRA";
      campoGestor.hidden = !(ehAdmin && papel.value === "colaborador");
    };
    empresa.addEventListener("change", visibilidade);
    papel.addEventListener("change", visibilidade);
    visibilidade();

    const form = h("form", { class: "cartao pilha", novalidate: true },
      h("fieldset", { disabled: !podeEditar, style: { border: "0", padding: "0", margin: "0" } },
        h("div", { class: "campos" },
          campo("Nome completo", nome, { inteiro: true }),
          campo("Matrícula", matricula, { ajuda: novo ? "Será o login" : "Não pode ser alterada" }),
          campo("Equipe", equipe),
          campo("Empresa", empresa, { inteiro: true }), campoOutra,
          ehAdmin && campo("Perfil de acesso", papel, { inteiro: true }),
          campoGestor,
          campo("Entrada", entrada, { ajuda: "Horário de trabalho" }), campo("Saída", saida),
          campo("Horário (como sai no formulário)", horario, { inteiro: true }),
          novo && campo("Senha provisória", senha, { inteiro: true, ajuda: "A pessoa troca no primeiro acesso." }),
          !novo && h("label", { class: "campo inteiro check" }, ativo, "Acesso ativo"))),
      erro, podeEditar && botao);
    mais(main, !podeEditar && aviso("atencao", "Você só pode alterar colaboradores da sua equipe."),
      h("div", { class: "form-largo pilha" }, form, !novo && podeEditar && cartaoSenha(usuario)));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emp = empresa.value === "OUTRA" ? maiusculo(empresaOutra.value) : empresa.value;
      const p = ehAdmin ? papel.value : "colaborador";
      if (!nome.value.trim() || !matricula.value.trim()) return erro.mostrar("Preencha nome e matrícula.");
      if (!/^[A-Za-z0-9._-]+$/.test(matricula.value.trim())) return erro.mostrar("A matrícula deve ter só letras e números.");
      if (!emp) return erro.mostrar("Informe a empresa.");
      let g = null;
      if (p === "colaborador") {
        g = ehAdmin ? gestores.find((x) => x.uid === gestor.value) : perfil;
        if (!g) return erro.mostrar("Escolha o gestor do colaborador.");
      }
      if (novo && senha.value.length < 6) return erro.mostrar("A senha provisória precisa ter pelo menos 6 caracteres.");
      const dados = {
        nome: nome.value, matricula: matricula.value, empresa: emp, papel: p,
        gestorUid: g ? g.uid : null, gestorNome: g ? g.nome : "",
        equipe: equipe.value, entrada: entrada.value, saida: saida.value, horario: horario.value, ativo: ativo.checked,
      };
      erro.mostrar(""); botao.disabled = true; botao.textContent = "Salvando…";
      try {
        if (novo) {
          await Banco.cadastrarUsuario(dados, senha.value);
          credenciais(maiusculo(dados.nome), dados.matricula.trim(), senha.value);
        } else {
          await Banco.atualizarUsuario(usuario.uid, dados, usuario.papel === "gestor" ? usuarios.filter((u) => u.gestorUid === usuario.uid) : []);
          toast("Cadastro atualizado.");
          voltar();
        }
      } catch (err) {
        erro.mostrar(mensagemErro(err)); botao.disabled = false; botao.textContent = novo ? "Cadastrar" : "Salvar alterações";
      }
    });
    nome.focus();
  }

  /** Redefinir a senha de quem esqueceu: gera uma senha provisória nova. */
  function cartaoSenha(usuario) {
    if (!USAR_REDEFINICAO) {
      return h("div", { class: "cartao pilha", style: { gap: "8px" } }, h("h2", {}, "Senha"),
        h("p", { class: "sub" }, "A redefinição de senha ainda não está ativada neste app. Enquanto isso, só a própria pessoa pode trocar a senha dela. Veja como ativar no arquivo LEIA-ME."));
    }
    const nova = h("input", { value: "", autocomplete: "off", placeholder: "Senha provisória" });
    const erro = caixaErro();
    const gerar = h("button", { type: "button", class: "btn" }, "Gerar");
    const botao = h("button", { type: "button", class: "btn primario" }, "Redefinir senha");
    gerar.addEventListener("click", () => { nova.value = senhaAleatoria(); });
    botao.addEventListener("click", async () => {
      if (nova.value.length < 6) return erro.mostrar("A senha precisa ter pelo menos 6 caracteres.");
      erro.mostrar(""); botao.disabled = true; botao.textContent = "Redefinindo…";
      try {
        await Banco.redefinirSenha(usuario.uid, nova.value);
        credenciais(usuario.nome, usuario.matricula, nova.value, true);
      } catch (err) {
        erro.mostrar(mensagemErro(err)); botao.disabled = false; botao.textContent = "Redefinir senha";
      }
    });
    return h("div", { class: "cartao pilha", style: { gap: "12px" } }, h("h2", {}, "Senha"),
      h("p", { class: "sub" }, "Para quem esqueceu a senha: gere uma senha provisória e passe para a pessoa. No próximo acesso ela cria a própria senha."),
      campo("Nova senha provisória", nova), erro,
      h("div", { class: "acoes" }, gerar, botao));
  }

  /** Depois de cadastrar: mostra os dados de acesso para enviar à pessoa. */
  function credenciais(nome, matricula, senha, redefinida) {
    const msg = `Seu acesso ao app de troca de escala:\n${location.origin}${location.pathname}\nMatrícula: ${matricula}\nSenha provisória: ${senha}\nAo entrar, você vai criar a sua própria senha.`;
    main = tela({ ...base, titulo: redefinida ? "Senha redefinida" : "Cadastro feito", sub: nome });
    mais(main, h("div", { class: "cartao pilha form-largo", style: { gap: "12px" } },
      h("h2", {}, primeiroNome(nome)),
      h("p", { class: "sub" }, "Passe estes dados para a pessoa. Ao entrar, ela cria a própria senha."),
      h("dl", { class: "linha-dados" }, h("dt", {}, "Matrícula"), h("dd", {}, matricula), h("dt", {}, "Senha provisória"), h("dd", { class: "mono" }, senha)),
      h("a", { class: "btn ok bloco", href: "https://wa.me/?text=" + encodeURIComponent(msg), target: "_blank", rel: "noreferrer" }, "Enviar pelo WhatsApp"),
      h("button", { class: "btn bloco", onClick: () => navigator.clipboard.writeText(msg).then(() => toast("Copiado."), () => toast("Não foi possível copiar.")) }, "Copiar dados"),
      h("button", { class: "btn primario bloco", onClick: voltar }, "Concluir")));
  }
}


/* =====================================================================
   7. INÍCIO — acompanha o login e escolhe a tela pelo endereço (#/...)
   ===================================================================== */
const estado = { usuario: undefined, perfil: undefined, erroPerfil: false };
let pararPerfil = null;
let ouvintes = [];

/** Registra um ouvinte do banco para ser desligado quando a tela mudar. */
function guardar(parar) { if (typeof parar === "function") ouvintes.push(parar); }
function sair() {
  const t = document.querySelector(".toast");
  if (t) t.remove();
  auth.signOut();
}
const rotaAtual = () => location.hash.replace(/^#/, "") || "/";

function mostrarBloqueio(texto) {
  por(document.getElementById("app"), h("div", { class: "entrada" }, aviso("atencao", texto), h("button", { class: "btn", onClick: sair }, "Sair")));
}

function desenhar() {
  ouvintes.forEach((parar) => { try { parar(); } catch (e) { /* ignora */ } });
  ouvintes = [];
  const app = document.getElementById("app");
  const rota = rotaAtual();
  const p = estado.perfil;

  if (abertoComoArquivo) {
    return por(app, h("div", { class: "entrada" }, marca("Falta um passo"),
      aviso("atencao", "O app foi aberto direto do arquivo (duplo clique no index.html). O login do Firebase só funciona por um endereço http://."),
      h("p", {}, "No Windows, dê dois cliques no arquivo ", h("b", {}, "iniciar.bat"), ", que está na mesma pasta. Ele abre o app em ",
        h("b", {}, "http://localhost:8080"), ". Deixe a janela preta aberta enquanto estiver usando."),
      h("p", { class: "sub" }, "Para os colaboradores usarem, publique no Firebase Hosting ou no servidor da empresa (veja o LEIA-ME).")));
  }
  if (!firebaseCarregado) {
    return por(app, h("div", { class: "entrada" }, marca("Sem conexão"),
      aviso("erro", "Não foi possível carregar o Firebase. Verifique a internet (ou se a rede da empresa bloqueia www.gstatic.com) e recarregue a página.")));
  }
  if (!configurado) {
    return por(app, h("div", { class: "entrada" }, marca("Configuração pendente"),
      aviso("atencao", "Preencha o bloco firebaseConfig no início do arquivo script.js com os dados do seu projeto Firebase (veja o LEIA-ME).")));
  }
  if (estado.usuario === undefined) return por(app, carregando());
  if (!estado.usuario) return rota === "/primeiro-acesso" ? telaPrimeiroAcesso() : telaLogin();
  if (estado.erroPerfil) return mostrarBloqueio("Não foi possível carregar seu cadastro. Verifique a conexão e tente de novo.");
  if (p === undefined) return por(app, carregando());
  if (p === null) return mostrarBloqueio("Seu login existe, mas o cadastro não foi encontrado. Procure o RH.");
  if (!p.ativo) return mostrarBloqueio("Seu acesso está desativado. Procure o RH ou o seu gestor.");
  if (p.trocarSenha) return telaTrocarSenha(p);

  if (rota === "/notificacoes") return telaNotificacoes(p);
  const troca = rota.match(/^\/t\/([\w-]+)/);
  if (troca) return telaTroca(p, troca[1]);
  if (p.papel === "colaborador") return rota === "/nova" ? telaNovaTroca(p) : telaInicioColaborador(p);
  const usuario = rota.match(/^\/usuario\/(.+)$/);
  if (usuario) return telaUsuario(p, usuario[1]);
  telaInicioGestor(p, rota);
}

if (pronto) {
  auth.onAuthStateChanged((u) => {
    estado.usuario = u;
    estado.perfil = undefined;
    estado.erroPerfil = false;
    if (pararPerfil) { pararPerfil(); pararPerfil = null; }
    Notificacoes.encerrar();
    if (u) {
      let anterior = null;
      pararPerfil = Banco.ouvirPerfil(u.uid, (perfil) => {
        // só redesenha quando algo do cadastro realmente mudou
        const chave = JSON.stringify(perfil && { ...perfil, criadoEm: null, atualizadoEm: null });
        if (chave === anterior) return;
        anterior = chave;
        estado.perfil = perfil;
        if (perfil && perfil.ativo && !perfil.trocarSenha) Notificacoes.iniciar(perfil);
        desenhar();
      }, () => { estado.erroPerfil = true; desenhar(); });
    }
    desenhar();
  });
}
window.addEventListener("hashchange", desenhar);
desenhar();
