import React, { useState, useRef, useEffect } from 'react';
import { 
  Scissors, Copy, Printer, Shield, BookOpen, Stamp, 
  Palette, Monitor, Package, CalendarCheck, PiggyBank,
  UserCheck, List, Key, Lock, Trash2, 
  X, CheckCircle2, Clock, ArrowRight, LogOut, Search, Loader2, AlertCircle, Eye, EyeOff, FolderOpen,  TrendingUp, DollarSign, Receipt, PieChart, Users, ChevronLeft, ChevronRight
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const SETORES = [
  { id: 'MATERIAIS', label: 'MATERIAL', icon: Scissors, shortcut: 'F1' },
  { id: 'CÓPIA', label: 'CÓPIA', icon: Copy, shortcut: 'F2' },
  { id: 'IMPR. P/B', label: 'IMPRESSÃO P/B', icon: Printer, shortcut: 'F3' },
  { id: 'IMPR. COLOR', label: 'IMPRESSÃO COLORIDA', icon: Printer, shortcut: 'F4' },
  { id: 'PLASTIFICAÇÃO', label: 'PLASTIFICAÇÃO', icon: Shield, shortcut: 'F5' },
  { id: 'ENCADERNAÇÃO', label: 'ENCADERNAÇÃO', icon: BookOpen, shortcut: 'F6' },
  { id: 'CARIMBO', label: 'CARIMBO', icon: Stamp, shortcut: 'F7' },
  { id: 'GRÁFICA', label: 'GRÁFICA', icon: Palette, shortcut: 'F8' },
  { id: 'INFORMÁTICA', label: 'INFORMÁTICA', icon: Monitor, shortcut: 'F9' },
  { id: 'PACOTE', label: 'PACOTE', icon: Package, shortcut: 'F10' },
  { id: 'MENSALISTA', label: 'MENSALISTA', icon: CalendarCheck, shortcut: 'F11', reqObs: true },
  { id: 'RETIRADA', label: 'RETIRADA', icon: PiggyBank, shortcut: 'F12', reqObs: true, isDanger: true },
];

const LINKS_DRIVE: Record<string, string> = {
  "MOGI": "https://drive.google.com/drive/folders/1_nXpre0UBFsiDTRNRh9nqVfgXWv9bQs0?usp=drive_link",
  "SUZANO": "https://drive.google.com/drive/folders/1YAwCBmHhPcVmprpFzSdE9C1f0C7bmZCe?usp=drive_link"
};

const USUARIOS_CONFIG: Record<string, { unidade: string; email: string }> = {
  "loja-MOGI": { unidade: "MOGI", email: "mogi@yamaprint.local" },
  "loja-SUZANO": { unidade: "SUZANO", email: "suzano@yamaprint.local" }
};

const formatarMoedaPtBr = (valor: number) => {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export default function App() {
  const [logado, setLogado] = useState(false);
  const [usuario, setUsuario] = useState('loja-MOGI');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  
  const [unidade, setUnidade] = useState(() => {
    return localStorage.getItem('yama_unidade') || 'MOGI';
  });

  useEffect(() => {
    localStorage.setItem('yama_unidade', unidade);
  }, [unidade]);

  const [statusCaixa, setStatusCaixa] = useState<Record<string, any>>({ status: 'A Carregando...' });
  const [setorAtivo, setSetorAtivo] = useState<string | null>(null);
  
  const [precoInput, setPrecoInput] = useState<string>('0');
  const [qtd, setQtd] = useState<number>(1);
  const [carrinho, setCarrinho] = useState<Array<{ setor: string; valor: number; qtd: number; obs: string }>>([]);

  const [modalAberto, setModalAberto] = useState<string | null>(null);
  const [trocoInput, setTrocoInput] = useState<string>('100.00');
  const [carregando, setCarregando] = useState<boolean>(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string>('');
  const [mensagemTrocaResultado, setMensagemTrocaResultado] = useState<string>('');
  const [erroLoginMsg, setErroLoginMsg] = useState<string | null>(null);

  const [sidebarExpandida, setSidebarExpandida] = useState(true);
  const [toast, setToast] = useState<{ mensagem: string; tipo: 'sucesso' | 'erro' | 'aviso' | 'retirada' | 'neutro' } | null>(null);

  const dispararToast = (mensagem: string, tipo: 'sucesso' | 'erro' | 'aviso' | 'retirada' | 'neutro' = 'sucesso') => {
    setToast({ mensagem, tipo });
    setTimeout(() => { setToast(null); }, 3000);
  };

  const [pendenteRetirada, setPendenteRetirada] = useState<{ valor: number; qtd: number } | null>(null);
  const [obsRetiradaInput, setObsRetiradaInput] = useState<string>('');

  const [dadosVendasModal, setDadosVendasModal] = useState<any[]>([]);
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [filtroSetor, setFiltroSetor] = useState<string>('TODOS');
  const [valorMin, setValorMin] = useState<string>('');
  const [valorMax, setValorMax] = useState<string>('');

  const [vendaParaCancelar, setVendaParaCancelar] = useState<any>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState<string>('');
  const [sucessoExclusaoMsg, setSucessoExclusaoMsg] = useState<string | null>(null);

  const inputPrecoRef = useRef<HTMLInputElement>(null);
  const inputTrocoRef = useRef<HTMLInputElement>(null);
  const inputObsRetiradaRef = useRef<HTMLInputElement>(null);
  const totalCarrinho = carrinho.reduce((acc, item) => acc + item.valor * item.qtd, 0);

  useEffect(() => {
    const verificarSessaoInicial = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setLogado(true);
          await carregarStatus(unidade);
        }
      } catch (e) {
        console.error("Erro na verificação inicial:", e);
      }
    };
    verificarSessaoInicial();
  }, [unidade]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (vendaParaCancelar) {
          setVendaParaCancelar(null);
        } else if (modalAberto) {
          setModalAberto(null);
        }
      }

      if (e.ctrlKey && logado && statusCaixa.status === 'Aberto' && !modalAberto) {
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault();
          setDadosVendasModal(statusCaixa.vendas || []);
          setTermoBusca('');
          setFiltroSetor('TODOS');
          setValorMin('');
          setValorMax('');
          setModalAberto('listar');
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setDadosVendasModal(statusCaixa.vendas || []);
          setModalAberto('fluxo_caixa');
        }
      }

      if (logado && statusCaixa.status === 'Aberto' && !modalAberto) {
        SETORES.forEach(s => {
          if (e.key.toLowerCase() === s.shortcut.toLowerCase()) {
            e.preventDefault();
            selecionarSetorDinamico(s.id);
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalAberto, vendaParaCancelar, logado, statusCaixa.status, statusCaixa.vendas]);

  useEffect(() => {
    if (modalAberto === 'abrir') {
      setTimeout(() => {
        if (inputTrocoRef.current) {
          inputTrocoRef.current.focus();
          inputTrocoRef.current.select();
        }
      }, 50);
    }
    if (modalAberto === 'modal_obs_retirada') {
      setTimeout(() => {
        if (inputObsRetiradaRef.current) {
          inputObsRetiradaRef.current.focus();
        }
      }, 50);
    }
  }, [modalAberto]);

  const lidarComMudancaPreco = (valorStr: string) => {
    if (valorStr.includes(',')) {
      setPrecoInput(valorStr);
      return;
    }
    const apenasDigitos = valorStr.replace(/\D/g, '');
    if (!apenasDigitos) {
      setPrecoInput('0');
      return;
    }
    setPrecoInput(parseInt(apenasDigitos, 10).toString());
  };

  const converterPrecoParaFloat = (valorStr: string) => {
    if (!valorStr) return 0;
    const formatado = valorStr.replace(/\./g, '').replace(',', '.');
    return parseFloat(formatado) || 0;
  };

  const fazerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroLoginMsg(null);
    const config = USUARIOS_CONFIG[usuario];
    if (!config) {
      setErroLoginMsg('Usuário inválido.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: config.email,
        password: senha
      });

      if (error) {
        setErroLoginMsg('Senha incorreta ou erro de autenticação.');
        return;
      }

      setUnidade(config.unidade);
      setLogado(true);
      await carregarStatus(config.unidade);
      dispararToast(`Bem-vindo à unidade ${config.unidade}!`, 'sucesso');
    } catch (err: any) {
      setErroLoginMsg('Erro ao efetuar login.');
    }
  };

  const fazerLogout = () => {
    supabase.auth.signOut();
    setLogado(false);
    setSenha('');
    setCarrinho([]);
    setSetorAtivo(null);
    dispararToast('Sessão encerrada.', 'aviso');
  };

  const carregarStatus = async (uni = unidade) => {
    try {
      const { data: sessoes, error: errSessao } = await supabase
        .from("caixa_sessoes")
        .select("*")
        .eq("unidade", uni)
        .eq("status", "ABERTO")
        .order("aberto_em", { ascending: false })
        .limit(1);

      if (errSessao) throw errSessao;

      const sessao = sessoes && sessoes.length > 0 ? sessoes[0] : null;

      if (!sessao) {
        setStatusCaixa({
          status: "Fechado",
          dataHora: "CAIXA FECHADO",
          trocoInicial: "0.00",
          caixa2Ativo: false,
          vendas: [],
          totais: { totalVendas: 0.0, saldoCaixa: 0.0, totalClientesUnicos: 0, ticketMedio: 0.0, porSetor: {}, porPagamento: { DINHEIRO: 0, PIX: 0, DÉBITO: 0, CRÉDITO: 0 } }
        });
        setDadosVendasModal([]);
        return;
      }

      const { data: vendasRaw } = await supabase
        .from("vendas")
        .select("*")
        .eq("sessao_id", sessao.id)
        .order("numero_sequencial", { ascending: true });

      let total_vendas = 0.0;
      let dinheiro_liquido = 0.0;
      let repasse_caixa_2 = 0.0;
      const SETORES_ORDEM = [
        "MATERIAIS", "CÓPIA", "IMPR. P/B", "IMPR. COLOR",
        "PLASTIFICAÇÃO", "ENCADERNAÇÃO", "CARIMBO", "GRÁFICA",
        "INFORMÁTICA", "PACOTE", "MENSALISTA", "RETIRADA"
      ];
      const por_setor: Record<string, number> = {};
      SETORES_ORDEM.forEach(s => por_setor[s] = 0.0);

      const por_pagto: Record<string, number> = { "DINHEIRO": 0.0, "PIX": 0.0, "DÉBITO": 0.0, "CRÉDITO": 0.0 };
      const vendas_formatadas: any[] = [];
      const ids_unicos_validos = new Set();

      if (vendasRaw) {
        vendasRaw.forEach((v: any) => {
          const valor = parseFloat(v.valor);
          const pagto = v.forma_pagto;
          const setor = v.setor;

          if (pagto !== "CANCELADO") {
            ids_unicos_validos.add(v.numero_sequencial);
            if (setor === "RETIRADA") {
              por_setor["RETIRADA"] = (por_setor["RETIRADA"] || 0) + valor;
              if (pagto === "DINHEIRO") dinheiro_liquido -= valor;
            } else {
              total_vendas += valor;
              if (por_setor[setor] !== undefined) por_setor[setor] += valor;
              if (por_pagto[pagto] !== undefined) por_pagto[pagto] += valor;
              if (pagto === "DINHEIRO") {
                dinheiro_liquido += valor;
                if (v.is_caixa_2) repasse_caixa_2 += valor;
              }
            }
          }

          const dataCriacao = new Date(v.criado_em);
          vendas_formatadas.push({
            uuid: v.id,
            id: String(v.numero_sequencial).padStart(4, '0'),
            setor: setor,
            hora: dataCriacao.toLocaleTimeString(),
            valor: valor,
            valorFormatado: formatarMoedaPtBr(valor),
            pagamento: pagto,
            obs: v.observacao || "",
            isCaixa2: v.is_caixa_2
          });
        });
      }

      vendas_formatadas.reverse();
      const total_clientes = ids_unicos_validos.size;
      const ticket_medio = total_clientes > 0 ? total_vendas / total_clientes : 0;
      const dtAbertura = new Date(sessao.aberto_em).toLocaleString();

      const statusObj = {
        status: "Aberto",
        sessaoId: sessao.id,
        dataAberturaISO: sessao.aberto_em.slice(0, 10),
        dataHora: dtAbertura,
        trocoInicial: parseFloat(sessao.troco_inicial).toFixed(2),
        caixa2Ativo: sessao.caixa_2_ativo,
        vendas: vendas_formatadas,
        totais: {
          totalVendas: parseFloat(total_vendas.toFixed(2)),
          saldoCaixa: parseFloat((parseFloat(sessao.troco_inicial) + dinheiro_liquido).toFixed(2)),
          repasseCaixa2: parseFloat(repasse_caixa_2.toFixed(2)),
          totalClientesUnicos: total_clientes,
          ticketMedio: parseFloat(ticket_medio.toFixed(2)),
          porSetor: por_setor,
          porPagamento: por_pagto
        }
      };

      setStatusCaixa(statusObj);
      setDadosVendasModal(vendas_formatadas);
    } catch (err) {
      console.error(err);
    }
  };

  const abrirPastaRegistros = () => {
    const link = LINKS_DRIVE[unidade] || "https://drive.google.com";
    window.open(link, '_blank');
  };

  const selecionarSetorDinamico = (idSetor: string) => {
    if (statusCaixa.status !== 'Aberto') {
      setModalAberto('aviso_caixa_fechado');
      return;
    }
    setSetorAtivo(idSetor);
    setTimeout(() => {
      if (inputPrecoRef.current) {
        inputPrecoRef.current.focus();
        inputPrecoRef.current.select();
      }
    }, 50);
  };

  const handleAbrirCaixa = async () => {
    setCarregando(true);
    try {
      const valorTroco = parseFloat(trocoInput.replace(',', '.')) || 0;
      const { error } = await supabase
        .from("caixa_sessoes")
        .insert([{ unidade, status: "ABERTO", troco_inicial: valorTroco, caixa_2_ativo: false }]);

      if (error) throw error;

      await carregarStatus(unidade);
      setModalAberto(null);
      dispararToast('Caixa aberto com sucesso!', 'sucesso');
    } catch (err) {
      alert('Erro ao abrir caixa.');
    } finally {
      setCarregando(false);
    }
  };

  const handleFecharCaixa = async () => {
    setCarregando(true);
    try {
      if (!statusCaixa.sessaoId) return;

      if (statusCaixa.caixa2Ativo) {
        alert("Finalize o Caixa Almoço antes de fechar o dia.");
        setModalAberto(null);
        setCarregando(false);
        return;
      }

      const dataCaixa = statusCaixa.dataAberturaISO || new Date().toISOString().slice(0, 10);
      const unidadeLower = unidade.toLowerCase();

      // ==========================================
      // 1. GERAR E GUARDAR PDF DE RESUMO COM 3 TABELAS
      // ==========================================
      const docResumo = new jsPDF();
      docResumo.setFont("Helvetica", "bold");
      docResumo.setFontSize(14);
      docResumo.text(`RELATÓRIO DE FECHAMENTO DE CAIXA`, 14, 18);
      docResumo.text(`UNIDADE ${unidade}`, 14, 25);

      docResumo.setFont("Helvetica", "normal");
      docResumo.setFontSize(10);
      const dataEmissaoStr = new Date().toLocaleString();
      docResumo.text(`Data de Emissão: ${dataEmissaoStr} | Clientes Atendidos: ${statusCaixa.totais.totalClientesUnicos}`, 14, 32);

      // Tabela 1: Setores
      docResumo.setFont("Helvetica", "bold");
      docResumo.text("1. Faturamento Detalhado por Setor", 14, 42);

      const dadosSetorPdf = Object.entries(statusCaixa.totais.porSetor || {}).map(([setor, valor]) => [
        setor,
        formatarMoedaPtBr(Number(valor))
      ]);

      autoTable(docResumo, {
        startY: 46,
        head: [['SETOR', 'FATURAMENTO']],
        body: dadosSetorPdf,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42], fontSize: 10 },
        columnStyles: { 
          0: { cellWidth: 120 },
          1: { cellWidth: 62, halign: 'right' } 
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const setorNome = data.row.raw[0];
            if (setorNome === 'RETIRADA') {
              data.cell.styles.textColor = [225, 29, 72];
            }
          }
        }
      });

      let nextY = (docResumo as any).lastAutoTable.finalY + 10;

      // Tabela 2: Resumo Financeiro
      docResumo.setFont("Helvetica", "bold");
      docResumo.text("2. Resumo Financeiro", 14, nextY);

      const dadosResumoFin = [
        ['Troco Inicial', formatarMoedaPtBr(Number(statusCaixa.trocoInicial || 0))],
        ['Total em Dinheiro', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.DINHEIRO || 0))],
        ['Total em PIX', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.PIX || 0))],
        ['Total em Débito', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.DÉBITO || 0))],
        ['Total em Crédito', formatarMoedaPtBr(Number(statusCaixa.totais.porPagamento?.CRÉDITO || 0))],
        ['Repasse 2º Caixa (Almoço)', formatarMoedaPtBr(Number(statusCaixa.totais.repasseCaixa2 || 0))]
      ];

      autoTable(docResumo, {
        startY: nextY + 4,
        body: dadosResumoFin,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 10 },
        columnStyles: { 
          0: { cellWidth: 120, fontStyle: 'bold' }, 
          1: { cellWidth: 62, halign: 'right' } 
        }
      });

      nextY = (docResumo as any).lastAutoTable.finalY + 10;

      // Tabela 3: Fechamento de Caixa
      docResumo.setFont("Helvetica", "bold");
      docResumo.text("3. Fechamento de Caixa", 14, nextY);

      const dadosFechamentoCaixa = [
        ['Ticket Médio', formatarMoedaPtBr(Number(statusCaixa.totais.ticketMedio || 0))],
        ['Faturamento Total', formatarMoedaPtBr(Number(statusCaixa.totais.totalVendas || 0))],
        ['Saldo em Caixa', formatarMoedaPtBr(Number(statusCaixa.totais.saldoCaixa || 0))]
      ];

      autoTable(docResumo, {
        startY: nextY + 4,
        body: dadosFechamentoCaixa,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 10 },
        columnStyles: { 
          0: { cellWidth: 120, fontStyle: 'bold' }, 
          1: { cellWidth: 62, halign: 'right' } 
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const label = data.row.raw[0];
            if (label === 'Faturamento Total') {
              data.cell.styles.textColor = [14, 116, 144]; // Azul escuro
              data.cell.styles.fontStyle = 'bold';
            } else if (label === 'Saldo em Caixa') {
              data.cell.styles.textColor = [5, 150, 105]; // Verde escuro
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });

      const blobResumo = docResumo.output('blob');
      const caminhoResumo = `${unidadeLower}/resumo/${dataCaixa}-R.pdf`;

      await supabase.storage
        .from('relatorios')
        .upload(caminhoResumo, blobResumo, { contentType: 'application/pdf', upsert: true });

      // ==========================================
      // 2. GERAR E GUARDAR PDF DE VENDAS DETALHADAS
      // ==========================================
      const docVendas = new jsPDF();
      docVendas.setFont("Helvetica", "bold");
      docVendas.setFontSize(14);
      docVendas.text(`REGISTRO DETALHADO DE VENDAS — UNIDADE ${unidade}`, 14, 20);

      docVendas.setFont("Helvetica", "normal");
      docVendas.setFontSize(10);
      docVendas.text(`Data de Abertura: ${dataCaixa}`, 14, 28);

      const linhasVendasPdf = (statusCaixa.vendas || []).map((v: any) => [
        `#${v.id}`,
        v.setor,
        v.hora,
        v.valorFormatado,
        v.pagamento,
        v.obs || '-'
      ]);

      autoTable(docVendas, {
        startY: 35,
        head: [['ID', 'Setor', 'Hora', 'Valor', 'Pagamento', 'Observação']],
        body: linhasVendasPdf,
        theme: 'grid',
        styles: { font: 'Helvetica', fontSize: 10 },
        headStyles: { fillColor: [15, 23, 42], fontSize: 10 },
        columnStyles: { 
          0: { cellWidth: 15 },
          1: { cellWidth: 35 },
          2: { cellWidth: 22 },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 26 },
          5: { cellWidth: 56 }
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const setorVal = data.row.raw[1];
            if (setorVal === 'RETIRADA') {
              data.cell.styles.textColor = [225, 29, 72];
            }
          }
        }
      });

      const blobVendas = docVendas.output('blob');
      const caminhoVendas = `${unidadeLower}/vendas/${dataCaixa}-V.pdf`;

      await supabase.storage
        .from('relatorios')
        .upload(caminhoVendas, blobVendas, { contentType: 'application/pdf', upsert: true });

      // ==========================================
      // 3. ATUALIZAR STATUS NO BANCO PARA FECHADO
      // ==========================================
      const { error } = await supabase
        .from("caixa_sessoes")
        .update({ status: "FECHADO", fechado_em: new Date().toISOString() })
        .eq("id", statusCaixa.sessaoId);

      if (error) throw error;

      setMensagemSucesso("Caixa fechado com sucesso!\nOs relatórios foram guardados com sucesso como (data)-R.pdf e (data)-V.pdf nas respetivas pastas.");
      setModalAberto('sucesso_fechamento');
      await carregarStatus();
      dispararToast('Caixa fechado e relatórios guardados!', 'sucesso');
    } catch (err: any) {
      console.error("Erro ao fechar caixa:", err);
      alert('Erro ao fechar caixa: ' + (err.message || 'Erro desconhecido'));
      setModalAberto(null);
    } finally {
      setCarregando(false);
    }
  };

  const handleTrocaCaixa = async (acao: 'iniciar' | 'finalizar') => {
    setCarregando(true);
    try {
      if (!statusCaixa.sessaoId) return;

      if (acao === 'iniciar') {
        const { error } = await supabase
          .from("caixa_sessoes")
          .update({ caixa_2_ativo: true })
          .eq("id", statusCaixa.sessaoId);

        if (error) throw error;
        setMensagemTrocaResultado("2º CAIXA iniciado com sucesso!\n\nAs próximas vendas serão registradas no 2º CAIXA com troco fixo base de R$ 375,00.");
      } else {
        const repasse = statusCaixa.totais?.repasseCaixa2 || 0;
        const { error } = await supabase
          .from("caixa_sessoes")
          .update({ caixa_2_ativo: false, repasse_caixa_2: repasse })
          .eq("id", statusCaixa.sessaoId);

        if (error) throw error;
        setMensagemTrocaResultado(`TROCA FINALIZADA!\n\nVALOR PARA REPASSE AO CAIXA PRINCIPAL: R$ ${repasse.toFixed(2).replace('.', ',')}`);
      }

      setModalAberto('sucesso_troca');
      await carregarStatus();
    } catch (err) {
      alert('Erro na troca de caixa.');
      setModalAberto(null);
    } finally {
      setCarregando(false);
    }
  };

  const adicionarAoCarrinho = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (statusCaixa.status !== 'Aberto') {
      setModalAberto('aviso_caixa_fechado');
      return;
    }
    if (!setorAtivo) {
      dispararToast('Selecione um setor primeiro.', 'aviso');
      return;
    }
    const valorNum = converterPrecoParaFloat(precoInput);
    if (valorNum <= 0 || qtd < 1) {
      dispararToast('Insira um preço e quantidade válidos.', 'aviso');
      return;
    }

    if (setorAtivo === 'RETIRADA' || setorAtivo === 'MENSALISTA') {
      setPendenteRetirada({ valor: valorNum, qtd });
      setObsRetiradaInput('');
      setModalAberto('modal_obs_retirada');
      return;
    }

    setCarrinho(prev => [...prev, { setor: setorAtivo, valor: valorNum, qtd, obs: '' }]);
    
    if (setorAtivo === 'RETIRADA') {
      dispararToast(`ITEM ${setorAtivo} ADICIONADO!`, 'retirada');
    } else {
      dispararToast(`ITEM ${setorAtivo} ADICIONADO!`, 'neutro');
    }

    setSetorAtivo(null);
    setPrecoInput('0');
    setQtd(1);
  };

  const confirmarRetiradaComObs = () => {
    if (!obsRetiradaInput.trim()) {
      dispararToast('A descrição é obrigatória.', 'aviso');
      return;
    }
    if (pendenteRetirada && setorAtivo) {
      setCarrinho(prev => [...prev, { 
        setor: setorAtivo, 
        valor: pendenteRetirada.valor, 
        qtd: pendenteRetirada.qtd, 
        obs: obsRetiradaInput.trim() 
      }]);
    }
    
    const isRet = setorAtivo === 'RETIRADA';
    setPendenteRetirada(null);
    setObsRetiradaInput('');
    setSetorAtivo(null);
    setPrecoInput('0');
    setQtd(1);
    setModalAberto(null);

    if (isRet) {
      dispararToast('RETIRADA REGISTRADA NO CARRINHO.', 'retirada');
    } else {
      dispararToast('Lançamento registrado no carrinho.', 'neutro');
    }
  };

  const finalizarVenda = async (formaPagto: string) => {
    if (statusCaixa.status !== 'Aberto') {
      setModalAberto('aviso_caixa_fechado');
      return;
    }
    if (carrinho.length === 0) {
      setModalAberto('aviso_carrinho_vazio');
      return;
    }

    const itensParaEnviar = [...carrinho];
    setCarrinho([]);
    setSetorAtivo(null);

    try {
      const { data: ultimas } = await supabase
        .from("vendas")
        .select("numero_sequencial")
        .eq("sessao_id", statusCaixa.sessaoId)
        .order("numero_sequencial", { ascending: false })
        .limit(1);

      const proximoSeq = ultimas && ultimas.length > 0 ? ultimas[0].numero_sequencial + 1 : 1;
      const isC2 = statusCaixa.caixa2Ativo;

      const linhasInserir = itensParaEnviar.map(item => ({
        sessao_id: statusCaixa.sessaoId,
        unidade: unidade,
        numero_sequencial: proximoSeq,
        setor: item.setor,
        valor: item.valor,
        quantidade: item.qtd,
        forma_pagto: formaPagto,
        observacao: isC2 ? `[2º CAIXA] ${item.obs || ''}`.trim() : (item.obs || ''),
        is_caixa_2: isC2
      }));

      const { error } = await supabase.from("vendas").insert(linhasInserir);
      if (error) throw error;

      dispararToast('Venda registrada com sucesso!', 'sucesso');
      await carregarStatus();
    } catch (err) {
      alert('Erro ao registrar venda.');
    }
  };

  const confirmarCancelamentoVenda = async () => {
    if (!motivoCancelamento.trim()) {
      dispararToast('O motivo da exclusão é obrigatório.', 'aviso');
      return;
    }
    setCarregando(true);
    try {
      const { error } = await supabase
        .from("vendas")
        .update({ forma_pagto: "CANCELADO", observacao: motivoCancelamento.trim() })
        .eq("id", vendaParaCancelar.uuid);

      if (error) throw error;

      setVendaParaCancelar(null);
      setMotivoCancelamento('');
      setSucessoExclusaoMsg('Venda excluída com sucesso.');
      dispararToast('VENDA EXCLUÍDA / CANCELADA', 'retirada');
      
      await carregarStatus();
    } catch (err) {
      alert('Erro ao excluir venda.');
    } finally {
      setCarregando(false);
    }
  };

  const vendasFiltradas = (dadosVendasModal || []).filter((v: any) => {
    const termo = termoBusca.toLowerCase();
    const matchTermo = String(v.id).toLowerCase().includes(termo) || String(v.setor).toLowerCase().includes(termo) || String(v.pagamento).toLowerCase().includes(termo) || String(v.obs || '').toLowerCase().includes(termo);
    const matchSetor = filtroSetor === 'TODOS' || v.setor === filtroSetor;
    const valorNum = Number(v.valor);
    const matchMin = valorMin === '' || valorNum >= parseFloat(valorMin);
    const matchMax = valorMax === '' || valorNum <= parseFloat(valorMax);
    return matchTermo && matchSetor && matchMin && matchMax;
  });

  const dadosGrafico = SETORES.map(s => {
    const totalSetor = (dadosVendasModal || [])
      .filter((v: any) => v.setor === s.id && v.pagamento !== 'CANCELADO')
      .reduce((acc: number, curr: any) => acc + Number(curr.valor), 0);
    return { nome: s.label, faturamento: totalSetor };
  }).filter(item => item.faturamento > 0);

  if (!logado) {
    return (
      <div 
        className="relative flex items-center justify-center h-screen bg-cover bg-center select-none"
        style={{ backgroundImage: `url('/bg/bg.png')` }}
      >
        <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs" />

        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative z-10 bg-white/90 backdrop-blur-xl p-10 rounded-3xl shadow-2xl w-[440px] text-center border border-white/40"
        >
          <div className="w-24 h-24 bg-sky-500/10 rounded-3xl mx-auto flex items-center justify-center shadow-inner mb-5 p-3 border border-sky-500/20">
            <img src="/icon/logo.svg" alt="Logo Yama" className="w-full h-full object-contain text-sky-600 brightness-0 saturate-100 [filter:invert(32%)_sepia(98%)_saturate(1421%)_hue-rotate(185deg)_brightness(94%)_contrast(98%)]" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">YAMA PRINT PDV</h2>
          <p className="text-xs font-bold text-sky-600 uppercase tracking-widest mb-8">Sistema Corporativo de Caixa</p>
          
          <form onSubmit={fazerLogin} className="space-y-5 text-left">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wide">Unidade / Loja</label>
              <select 
                value={usuario} 
                onChange={e => setUsuario(e.target.value)} 
                className="w-full px-4 py-3.5 border border-slate-300 rounded-xl bg-white font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-xs transition"
              >
                <option value="loja-MOGI">Loja Mogi das Cruzes</option>
                <option value="loja-SUZANO">Loja Suzano</option>
              </select>
            </div>
            <div className="relative">
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wide">Senha de Acesso</label>
              <input 
                type={mostrarSenha ? "text" : "password"} 
                value={senha} 
                onChange={e => setSenha(e.target.value)} 
                placeholder="••••••••" 
                required 
                className="w-full px-4 py-3.5 pr-12 border border-slate-300 rounded-xl bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-xs transition" 
              />
              <button 
                type="button" 
                onClick={() => setMostrarSenha(!mostrarSenha)} 
                className="absolute right-3.5 top-10 text-slate-400 hover:text-slate-600 cursor-pointer transition"
              >
                {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-sky-500/30 transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider text-xs"
            >
              <span>Entrar no Sistema</span><ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {erroLoginMsg && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold">
              {erroLoginMsg}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const caixaAberto = statusCaixa.status === 'Aberto';
  const totalVendasBadge = statusCaixa.vendas ? statusCaixa.vendas.filter((v: any) => v.pagamento !== 'CANCELADO').length : 0;

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 select-none overflow-hidden font-sans">
      
      <motion.aside 
        animate={{ width: sidebarExpandida ? 250 : 80 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-gradient-to-b from-blue-900 via-blue-950 to-slate-950 text-white flex flex-col border-r border-blue-900/40 shadow-2xl z-20 relative overflow-hidden"
      >
        <div className="p-4 flex items-center gap-3 border-b border-white/10 h-20">
          <div className="w-10 h-10 flex items-center justify-center shrink-0 p-1">
            <img src="/icon/logo.svg" alt="Logo Yama" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          {sidebarExpandida && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden truncate">
              <span className="text-[9px] font-black tracking-widest text-sky-400 uppercase block">Yama Print</span>
              <h2 className="text-xs font-black text-white tracking-wide truncate">LOJA {unidade}</h2>
            </motion.div>
          )}
        </div>

        <div className="flex-1 py-3 px-3 space-y-1.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          <div className="relative group/tip">
            <button 
              onClick={() => { 
                if (!caixaAberto) {
                  setModalAberto('aviso_caixa_fechado');
                  return;
                }
                setDadosVendasModal(statusCaixa.vendas || []); 
                setTermoBusca(''); 
                setFiltroSetor('TODOS'); 
                setValorMin(''); 
                setValorMax(''); 
                setModalAberto('listar'); 
              }} 
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              <div className="flex items-center gap-3.5 truncate">
                <List className="w-5 h-5 text-sky-400 shrink-0" />
                {sidebarExpandida && <span className="truncate">Listar Vendas</span>}
              </div>
              {sidebarExpandida && totalVendasBadge > 0 && (
                <span className="bg-sky-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                  {totalVendasBadge}
                </span>
              )}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Listar Vendas {totalVendasBadge > 0 ? `(${totalVendasBadge})` : ''}
              </div>
            )}
          </div>

          <div className="relative group/tip">
            <button 
              onClick={() => { 
                if (!caixaAberto) {
                  setModalAberto('aviso_caixa_fechado');
                  return;
                }
                setDadosVendasModal(statusCaixa.vendas || []); 
                setModalAberto('fluxo_caixa'); 
              }} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              <PieChart className="w-5 h-5 text-teal-400 shrink-0" />
              {sidebarExpandida && <span className="truncate">Fluxo de Caixa</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Fluxo de Caixa
              </div>
            )}
          </div>

          <div className="my-2 border-t border-white/10" />

          <div className="relative group/tip">
            <button 
              onClick={() => setModalAberto('troca')} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              <UserCheck className="w-5 h-5 text-purple-400 shrink-0" />
              {sidebarExpandida && <span className="truncate">Troca de Caixa</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Troca de Caixa
              </div>
            )}
          </div>

          <div className="relative group/tip">
            <button 
              onClick={abrirPastaRegistros} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              <FolderOpen className="w-5 h-5 text-sky-300 shrink-0" />
              {sidebarExpandida && <span className="truncate">Registros</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Registros
              </div>
            )}
          </div>

          <div className="my-2 border-t border-white/10" />

          <div className="relative group/tip">
            {!caixaAberto ? (
              <button 
                onClick={() => setModalAberto('abrir')} 
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-emerald-600/30 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
              >
                <Key className="w-5 h-5 text-emerald-400 shrink-0" />
                {sidebarExpandida && <span className="truncate">Abrir Caixa</span>}
              </button>
            ) : (
              <button 
                onClick={() => setModalAberto('fechar')} 
                className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-rose-600/30 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
              >
                <Lock className="w-5 h-5 text-rose-400 shrink-0" />
                {sidebarExpandida && <span className="truncate">Fechar Caixa</span>}
              </button>
            )}
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                {!caixaAberto ? "Abrir Caixa" : "Fechar Caixa"}
              </div>
            )}
          </div>
        </div>

        {/* Bloco Inferior: Botão Sair do Sistema e Recolher */}
        <div className="p-3 border-t border-white/10 flex flex-col gap-2 bg-black/20">
          <div className="relative group/tip">
            <button 
              onClick={fazerLogout} 
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl hover:bg-rose-700/40 text-slate-200 hover:text-white font-bold text-xs transition cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-rose-400 shrink-0" />
              {sidebarExpandida && <span className="truncate">Sair do Sistema</span>}
            </button>
            {!sidebarExpandida && (
              <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/tip:opacity-100 pointer-events-none transition whitespace-nowrap z-50 border border-slate-700">
                Sair do Sistema
              </div>
            )}
          </div>

          <button 
            onClick={() => setSidebarExpandida(!sidebarExpandida)}
            title={sidebarExpandida ? "Recolher menu" : "Expandir menu"}
            className="w-full flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/40 border border-sky-400/30 text-white transition cursor-pointer shadow-md group"
          >
            {sidebarExpandida ? (
              <>
                <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest text-sky-200">Recolher</span>
              </>
            ) : (
              <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            )}
          </button>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shadow-xs z-10 h-18">
          <div className="flex items-center gap-6 text-xs font-medium">
            <div className="flex items-center gap-2.5">
              <span className="text-slate-400 font-bold">STATUS:</span>
              <div className="flex items-center gap-2">
                <span className={`font-extrabold px-2.5 py-1 rounded-full ${caixaAberto ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                  {statusCaixa.status.toUpperCase()}
                </span>
                <span className="relative flex h-3 w-3">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${caixaAberto ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${caixaAberto ? 'bg-emerald-500' : 'bg-rose-500'} shadow-sm`}></span>
                </span>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-200" />
            <div><span className="text-slate-400 font-bold">DATA/HORA:</span> <strong className="text-slate-700">{statusCaixa.dataHora}</strong></div>
            <div className="h-4 w-px bg-slate-200" />
            <div><span className="text-slate-400 font-bold">TROCO INICIAL:</span> <strong className="text-emerald-600">R$ {statusCaixa.trocoInicial}</strong></div>
            <div className="h-4 w-px bg-slate-200" />
            
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">OPERAÇÃO:</span>
              <span className={`font-extrabold px-3 py-1 rounded-full border ${statusCaixa.caixa2Ativo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-purple-100 text-purple-700 border-purple-200'}`}>
                {statusCaixa.caixa2Ativo ? 'ALMOÇO' : 'CAIXA PRINCIPAL'}
              </span>
            </div>
          </div>
        </header>

        <main className="flex flex-1 gap-5 p-5 overflow-hidden">
          <div className="w-2/5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3.5 flex-1">
              {SETORES.map((s) => {
                const Icon = s.icon;
                const ativo = setorAtivo === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selecionarSetorDinamico(s.id)}
                    className={`group relative flex flex-col items-center justify-center p-3.5 rounded-2xl border text-xs font-extrabold transition-all cursor-pointer shadow-xs active:scale-95 ${
                      ativo 
                        ? (s.isDanger ? 'bg-rose-600 text-white border-rose-600 ring-4 ring-rose-600/20' : 'bg-gradient-to-b from-blue-900 to-blue-950 text-white border-blue-900 ring-4 ring-blue-900/20') 
                        : (s.isDanger ? 'bg-white text-slate-700 border-rose-200 hover:bg-rose-50' : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50/50')
                    }`}
                  >
                    <span className={`absolute top-2.5 right-3 text-[10px] font-black px-1.5 py-0.5 rounded-md ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{s.shortcut}</span>
                    <div className={`p-2 rounded-xl mb-1.5 ${ativo ? 'bg-white/20 text-white' : s.isDanger ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-blue-900'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="tracking-tight text-center">{s.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 h-48 flex flex-col shadow-xs">
              <div className="flex items-center gap-2 text-[11px] font-black text-slate-500 uppercase tracking-widest pb-2.5 mb-2.5 border-b border-slate-100">
                <Clock className="w-3.5 h-3.5 text-sky-500" /> Últimas Entradas
              </div>
              <div className="grid grid-cols-2 gap-2.5 flex-1 items-start content-start overflow-y-auto pr-1">
                {statusCaixa.vendas && statusCaixa.vendas.length > 0 ? (
                  statusCaixa.vendas.slice(0, 6).map((v: any) => {
                    let corFundo = "bg-cyan-500";
                    if (v.pagamento === 'DINHEIRO') corFundo = "bg-emerald-600";
                    else if (v.pagamento === 'CRÉDITO') corFundo = "bg-rose-600";
                    else if (v.pagamento === 'DÉBITO') corFundo = "bg-blue-600";
                    else if (v.pagamento === 'CANCELADO') corFundo = "bg-slate-400";
                    return (
                      <div key={v.uuid} className={`grid grid-cols-4 items-center px-3 py-2 border rounded-xl text-xs shadow-2xs w-full gap-1 ${v.setor === 'RETIRADA' ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200/80'}`}>
                        <span className={`font-extrabold truncate ${v.setor === 'RETIRADA' ? 'text-rose-700' : 'text-slate-500'}`}>#{v.id}</span>
                        <span className={`font-black truncate ${v.setor === 'RETIRADA' ? 'text-rose-700' : 'text-slate-800'}`}>{v.valorFormatado}</span>
                        <span className="font-bold text-[10px] text-slate-600 truncate">{v.setor}</span>
                        <div className="flex justify-end">
                          <span className={`text-[9px] font-black text-white px-1.5 py-0.5 rounded-md truncate ${corFundo}`}>{v.pagamento}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-2 text-center text-slate-400 text-xs pt-6 font-medium">Nenhuma entrada recente.</div>
                )}
              </div>
            </div>
          </div>

          <div className="w-3/5 flex flex-col gap-4">
            
            <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center justify-between shadow-xs relative overflow-hidden">
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block mb-0.5">Item em Registro</span>
                <span className="text-base font-black text-blue-950 tracking-wide">{setorAtivo || 'Nenhum selecionado'}</span>
              </div>

              <div className="absolute right-6 top-1/2 -translate-y-1/2 z-20">
                <AnimatePresence>
                  {toast && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: 10 }}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-white font-black text-xs uppercase tracking-wider"
                      style={{
                        background: toast.tipo === 'sucesso' ? '#059669' : toast.tipo === 'retirada' || toast.tipo === 'erro' ? '#e11d48' : toast.tipo === 'neutro' ? '#0f172a' : '#d97706',
                        borderColor: 'rgba(255,255,255,0.3)'
                      }}
                    >
                      {toast.tipo === 'sucesso' && <CheckCircle2 className="w-4 h-4 text-emerald-200" />}
                      {(toast.tipo === 'retirada' || toast.tipo === 'erro') && <AlertCircle className="w-4 h-4 text-rose-200" />}
                      {toast.tipo === 'aviso' && <AlertCircle className="w-4 h-4 text-amber-200" />}
                      {toast.tipo === 'neutro' && <CheckCircle2 className="w-4 h-4 text-sky-300" />}
                      <span>{toast.mensagem}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <form onSubmit={adicionarAoCarrinho} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Preço Unit. (R$):</label>
                <input
                  ref={inputPrecoRef}
                  type="text"
                  value={precoInput}
                  onChange={e => lidarComMudancaPreco(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarAoCarrinho();
                    }
                  }}
                  className="w-36 px-3.5 py-2.5 border border-slate-300 bg-slate-50 rounded-xl text-base font-black text-slate-800 focus:outline-none focus:border-blue-900"
                />
              </div>
              <div className="flex items-center gap-2.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Qtd:</label>
                <input
                  type="number"
                  min={1}
                  value={qtd}
                  onChange={e => setQtd(parseInt(e.target.value) || 1)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarAoCarrinho();
                    }
                  }}
                  className="w-20 px-3.5 py-2.5 border border-slate-300 bg-slate-50 rounded-xl text-base font-black text-center text-slate-800 focus:outline-none"
                />
              </div>
              <button type="button" onClick={() => { setCarrinho([]); dispararToast('Carrinho limpo.', 'aviso'); }} className="flex items-center gap-2 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition ml-auto cursor-pointer">
                <Trash2 className="w-4 h-4" /> Limpar
              </button>
            </form>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex-1 flex flex-col overflow-hidden shadow-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5 block">Itens da Venda Atual</span>
              <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
                {carrinho.length === 0 ? (
                  <li className="h-full flex items-center justify-center text-sm text-slate-400 font-medium">Carrinho vazio. Selecione um setor e adicione itens (Pressione ENTER).</li>
                ) : (
                  carrinho.map((item, idx) => (
                    <li key={idx} className="py-3 px-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-base text-slate-900 tracking-tight">{item.setor}</span>
                        {item.obs && <span className="text-xs text-slate-500 italic font-medium">({item.obs})</span>}
                      </div>
                      <div className="flex items-center gap-5">
                        <span className="font-black text-base text-emerald-600 tracking-tight">R$ {(item.valor * item.qtd).toFixed(2).replace('.', ',')}</span>
                        <button onClick={() => setCarrinho(carrinho.filter((_, i) => i !== idx))} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-3.5 mb-4 flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total a Pagar</span>
                <span className="text-4xl font-black text-slate-900 tracking-tight">R$ {totalCarrinho.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <button onClick={() => finalizarVenda('DINHEIRO')} className="py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider shadow-md cursor-pointer">DINHEIRO</button>
                <button onClick={() => finalizarVenda('PIX')} className="py-4 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-sm uppercase tracking-wider shadow-md cursor-pointer">PIX</button>
                <button onClick={() => finalizarVenda('DÉBITO')} className="py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider shadow-md cursor-pointer">DÉBITO</button>
                <button onClick={() => finalizarVenda('CRÉDITO')} className="py-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm uppercase tracking-wider shadow-md cursor-pointer">CRÉDITO</button>
              </div>
            </div>
          </div>
        </main>

        <AnimatePresence>
          {modalAberto && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            >
              {modalAberto === 'abrir' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[400px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <Key className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Abrir Caixa</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-6">Informe o valor do troco inicial:</p>
                  
                  <form onSubmit={e => { e.preventDefault(); handleAbrirCaixa(); }}>
                    <div className="relative mb-6">
                      <span className="absolute left-4 top-3.5 text-base font-black text-slate-400">R$</span>
                      <input 
                        ref={inputTrocoRef}
                        type="text" 
                        value={trocoInput} 
                        onChange={e => setTrocoInput(e.target.value)} 
                        className="w-full pl-12 pr-4 py-3 border border-slate-300 bg-slate-50 rounded-xl text-center text-xl font-black text-slate-800 focus:outline-none" 
                      />
                    </div>

                    {carregando ? (
                      <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold"><Loader2 className="w-5 h-5 animate-spin" /> Abrindo caixa...</div>
                    ) : (
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setModalAberto(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer">Cancelar</button>
                        <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer">Abrir Caixa</button>
                      </div>
                    )}
                  </form>
                </motion.div>
              )}

              {modalAberto === 'fechar' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[400px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Fechar Caixa</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-6">Deseja fechar o caixa e guardar os relatórios nas pastas de Resumo e Vendas?</p>
                  {carregando ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-rose-50 text-rose-700 rounded-xl font-bold"><Loader2 className="w-5 h-5 animate-spin" /> A guardar relatórios...</div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => setModalAberto(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer">Não</button>
                      <button onClick={handleFecharCaixa} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer">Sim, Fechar</button>
                    </div>
                  )}
                </motion.div>
              )}

              {modalAberto === 'sucesso_fechamento' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[420px] text-center shadow-2xl"
                >
                  <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
                  <h3 className="text-xl font-black text-slate-800 mb-2">CAIXA FECHADO COM SUCESSO!</h3>
                  <p className="text-xs font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-6 whitespace-pre-line text-left">{mensagemSucesso}</p>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-md">OK</button>
                </motion.div>
              )}

              {modalAberto === 'troca' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[400px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Troca de Caixa</h3>
                  <p className="text-xs font-semibold text-slate-600 mb-6 leading-relaxed">
                    {statusCaixa.caixa2Ativo ? "Deseja finalizar o repasse do 2º Caixa?" : "Deseja iniciar o 2º Caixa com troco fixo de R$ 375,00?"}
                  </p>
                  {carregando ? (
                    <div className="flex items-center justify-center gap-2 py-3 bg-violet-50 text-violet-700 rounded-xl font-bold"><Loader2 className="w-5 h-5 animate-spin" /> Processando...</div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={() => setModalAberto(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer">Voltar</button>
                      <button onClick={() => handleTrocaCaixa(statusCaixa.caixa2Ativo ? 'finalizar' : 'iniciar')} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer">Confirmar</button>
                    </div>
                  )}
                </motion.div>
              )}

              {modalAberto === 'sucesso_troca' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[440px] text-center shadow-2xl border-t-8 border-violet-500"
                >
                  <UserCheck className="w-16 h-16 text-violet-600 mx-auto mb-3" />
                  <h3 className="text-xl font-black text-slate-900 mb-2">TROCA DE CAIXA</h3>
                  <p className="text-xs font-medium text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 whitespace-pre-line text-left leading-relaxed">{mensagemTrocaResultado}</p>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-md">OK</button>
                </motion.div>
              )}

              {modalAberto === 'modal_obs_retirada' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[420px] text-center shadow-2xl"
                >
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-1">Motivo / Descrição</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-4">Informe a descrição obrigatória para a {setorAtivo}:</p>
                  <form onSubmit={e => { e.preventDefault(); confirmarRetiradaComObs(); }}>
                    <input 
                      ref={inputObsRetiradaRef}
                      type="text"
                      value={obsRetiradaInput}
                      onChange={e => setObsRetiradaInput(e.target.value)}
                      placeholder="Ex: Retirada para pagamento de fornecedor..."
                      className="w-full p-3.5 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 mb-6"
                    />
                    <div className="flex gap-3">
                      <button type="button" onClick={() => { setModalAberto(null); setSetorAtivo(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer">Cancelar</button>
                      <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer">Confirmar</button>
                    </div>
                  </form>
                </motion.div>
              )}

              {modalAberto === 'aviso_carrinho_vazio' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[380px] text-center shadow-2xl border-t-8 border-amber-500"
                >
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-1">Carrinho Vazio</h3>
                  <p className="text-xs font-semibold text-slate-500 mb-6">Adicione pelo menos um item antes de finalizar a venda.</p>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-md">OK</button>
                </motion.div>
              )}

              {modalAberto === 'fluxo_caixa' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[1000px] max-h-[92vh] flex flex-col shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">Fluxo de Caixa e Análise Diária</h3>
                      <p className="text-xs text-slate-500 font-medium">Indicadores gerais de faturamento e desempenho por setor</p>
                    </div>
                    <button onClick={() => setModalAberto(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-3 mb-6">
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Faturamento</span>
                        <span className="text-sm font-black text-slate-900">R$ {statusCaixa.totais?.totalVendas?.toFixed(2).replace('.', ',') || '0,00'}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Saldo Caixa</span>
                        <span className="text-sm font-black text-slate-900">R$ {statusCaixa.totais?.saldoCaixa?.toFixed(2).replace('.', ',') || '0,00'}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Clientes (IDs)</span>
                        <span className="text-sm font-black text-slate-900">{statusCaixa.totais?.totalClientesUnicos || 0} un.</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-violet-50 text-violet-600 rounded-xl">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Ticket Médio</span>
                        <span className="text-sm font-black text-slate-900">R$ {((statusCaixa.totais?.totalClientesUnicos ?? 0) > 0 ? ((statusCaixa.totais?.totalVendas ?? 0) / (statusCaixa.totais?.totalClientesUnicos ?? 1)) : 0).toFixed(2).replace('.', ',')}</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-3">
                      <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                        <X className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Cancelados</span>
                        <span className="text-sm font-black text-slate-900">{statusCaixa.vendas?.filter((v:any)=>v.pagamento==='CANCELADO').length || 0} reg.</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center mb-6">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Faturamento por Setor (R$)</h4>
                    {dadosGrafico.length === 0 ? (
                      <p className="text-slate-400 text-xs py-10">Nenhum dado de venda registrado para exibir no gráfico.</p>
                    ) : (
                      <div className="w-full h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dadosGrafico}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="nome" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                            <Tooltip formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'Faturamento']} />
                            <Bar dataKey="faturamento" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase transition cursor-pointer">Fechar Fluxo de Caixa</button>
                </motion.div>
              )}

              {modalAberto === 'listar' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-white border border-slate-200 p-8 rounded-3xl w-[980px] max-h-[92vh] flex flex-col shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-slate-800">Listar Vendas e Movimentações</h3>
                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl border border-slate-200">Total listado: {vendasFiltradas.length} itens</span>
                  </div>

                  {sucessoExclusaoMsg && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-between">
                      <span>{sucessoExclusaoMsg}</span>
                      <button onClick={() => setSucessoExclusaoMsg(null)} className="text-emerald-700 font-bold px-2">×</button>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="relative col-span-1">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input type="text" placeholder="Buscar..." value={termoBusca} onChange={e => setTermoBusca(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-slate-700 focus:outline-none" />
                    </div>
                    <div>
                      <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)} className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold text-slate-700">
                        <option value="TODOS">Todos os Setores</option>
                        {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="Mín R$" value={valorMin} onChange={e => setValorMin(e.target.value)} className="w-full px-2 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold" />
                      <span className="text-slate-400">-</span>
                      <input type="number" placeholder="Máx R$" value={valorMax} onChange={e => setValorMax(e.target.value)} className="w-full px-2 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold" />
                    </div>
                    <div className="flex items-center justify-end">
                      <button onClick={() => { setTermoBusca(''); setFiltroSetor('TODOS'); setValorMin(''); setValorMax(''); }} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer w-full">Limpar Filtros</button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl mb-5 bg-slate-50 max-h-[45vh]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0 uppercase font-extrabold z-10">
                        <tr>
                          <th className="p-3 border-b">ID</th>
                          <th className="p-3 border-b">Setor</th>
                          <th className="p-3 border-b">Hora</th>
                          <th className="p-3 border-b">Valor</th>
                          <th className="p-3 border-b">Pagto</th>
                          <th className="p-3 border-b">Obs</th>
                          <th className="p-3 border-b text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {vendasFiltradas.length === 0 ? (
                          <tr><td colSpan={7} className="text-center p-6 text-slate-400 font-medium">Nenhuma venda encontrada.</td></tr>
                        ) : (
                          vendasFiltradas.map((v: any) => {
                            const isRetirada = v.setor === 'RETIRADA';
                            const isCancelado = v.pagamento === 'CANCELADO';
                            return (
                              <tr key={v.uuid} className={`hover:bg-slate-100/60 ${isCancelado ? 'bg-rose-50 line-through text-rose-500' : isRetirada ? 'bg-rose-50/60' : ''}`}>
                                <td className={`p-3 font-bold ${isRetirada ? 'text-rose-700 font-black' : 'text-slate-700'}`}>#{v.id}</td>
                                <td className={`p-3 font-semibold ${isRetirada ? 'text-rose-700 font-black' : 'text-slate-700'}`}>{v.setor}</td>
                                <td className="p-3 text-slate-500">{v.hora}</td>
                                <td className={`p-3 font-black ${isRetirada ? 'text-rose-600' : 'text-emerald-600'}`}>{v.valorFormatado}</td>
                                <td className="p-3"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${isRetirada ? 'bg-rose-200 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>{v.pagamento}</span></td>
                                <td className={`p-3 italic ${isRetirada ? 'text-rose-800 font-bold' : 'text-slate-500'}`}>{v.obs}</td>
                                <td className="p-3 text-center">
                                  {!isCancelado && (
                                    <button onClick={() => { setSucessoExclusaoMsg(null); setVendaParaCancelar(v); }} title="Excluir Venda" className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-lg transition cursor-pointer">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase transition cursor-pointer">Fechar</button>
                </motion.div>
              )}

              {vendaParaCancelar && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
                >
                  <div className="bg-white border border-slate-200 p-8 rounded-3xl w-[420px] text-center shadow-2xl">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-1">Excluir / Cancelar Venda</h3>
                    <p className="text-xs font-semibold text-slate-500 mb-4">Insira o motivo obrigatório para excluir a venda #{vendaParaCancelar.id}:</p>
                    <textarea
                      rows={3}
                      value={motivoCancelamento}
                      onChange={e => setMotivoCancelamento(e.target.value)}
                      placeholder="Ex: Item lançado errado..."
                      className="w-full p-3 border border-slate-300 rounded-xl bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none mb-6 resize-none"
                    />
                    <div className="flex gap-3">
                      <button onClick={() => { setVendaParaCancelar(null); setMotivoCancelamento(''); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-xl font-extrabold text-xs uppercase cursor-pointer">Voltar</button>
                      <button onClick={confirmarCancelamentoVenda} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-extrabold text-xs uppercase shadow-md cursor-pointer">Confirmar Exclusão</button>
                    </div>
                  </div>
                </motion.div>
              )}

              {modalAberto === 'aviso_caixa_fechado' && (
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
                >
                  <div className="bg-white border border-slate-200 p-6 rounded-3xl w-[360px] text-center shadow-2xl">
                    <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-3">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 mb-1">Caixa Fechado</h3>
                    <p className="text-xs font-semibold text-slate-500 mb-5">Por favor, abra o caixa antes de iniciar a operação.</p>
                    <button onClick={() => setModalAberto(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer">OK</button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}