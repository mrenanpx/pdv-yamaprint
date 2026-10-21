import jsPDF from 'jspdf';
import 'jspdf-autotable';

export const gerarPDFNavegador = (unidade: string, sessao: any, resumo: any) => {
  const doc = new jsPDF();
  const agora = new Date();

  // Cabeçalho
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`RELATÓRIO DE FECHAMENTO DE CAIXA — UNIDADE ${unidade}`, 14, 20);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Data de Emissão: ${agora.toLocaleString()} | Clientes Atendidos: ${resumo.totais.totalClientesUnicos}`, 14, 28);

  // Tabela 1: Faturamento por Setor
  doc.setFont("Helvetica", "bold");
  doc.text("1. Faturamento Detalhado por Setor", 14, 38);

  const dadosSetores = Object.entries(resumo.totais.porSetor).map(([setor, valor]: [string, any]) => [
    setor,
    `R$ ${valor.toFixed(2).replace('.', ',')}`
  ]);

  (doc as any).autoTable({
    startY: 42,
    head: [['SETOR', 'FATURAMENTO']],
    body: dadosSetores,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] },
    styles: { font: 'Helvetica', fontSize: 10 }
  });

  // Tabela 2: Resumo Financeiro
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont("Helvetica", "bold");
  doc.text("2. Resumo Financeiro e Fechamento de Caixa", 14, finalY);

  const dadosTotais = [
    ['Troco Inicial', `R$ ${Number(sessao.troco_inicial || 0).toFixed(2).replace('.', ',')}`],
    ['Total em Dinheiro', `R$ ${resumo.totais.porPagamento.DINHEIRO.toFixed(2).replace('.', ',')}`],
    ['Total em PIX', `R$ ${resumo.totais.porPagamento.PIX.toFixed(2).replace('.', ',')}`],
    ['Total em Débito', `R$ ${resumo.totais.porPagamento.DÉBITO.toFixed(2).replace('.', ',')}`],
    ['Total em Crédito', `R$ ${resumo.totais.porPagamento.CRÉDITO.toFixed(2).replace('.', ',')}`],
    ['Repasse 2º Caixa (Almoço)', `R$ ${resumo.totais.repasseCaixa2.toFixed(2).replace('.', ',')}`],
    ['TICKET MÉDIO', `R$ ${resumo.totais.ticketMedio.toFixed(2).replace('.', ',')}`],
    ['FATURAMENTO TOTAL', `R$ ${resumo.totais.totalVendas.toFixed(2).replace('.', ',')}`],
    ['SALDO EM CAIXA', `R$ ${resumo.totais.saldoCaixa.toFixed(2).replace('.', ',')}`]
  ];

  (doc as any).autoTable({
    startY: finalY + 4,
    body: dadosTotais,
    theme: 'grid',
    styles: { font: 'Helvetica', fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold' } }
  });

  // Descarrega o PDF automaticamente
  doc.save(`Fechamento_${unidade}_${agora.toISOString().slice(0,10)}.pdf`);
};