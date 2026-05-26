import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { listCommissionExtract } from "@/lib/requests.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2, FileSpreadsheet, TrendingUp } from "lucide-react";

const BRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtBR = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-BR");
};

const roleLabel = (r: string) =>
  r === "corretor" ? "Corretor" : r === "gerente" ? "Gerência" : "Gestão";

type Row = {
  id: string;
  sale_id: string;
  role: "corretor" | "gerente" | "diretor";
  tipo: string;
  valor_pago: number;
  bonus: number;
  desconto_distrato: number;
  paid_at: string | null;
  recipient_name: string | null;
  sale: {
    data: string | null;
    comprador: string | null;
    empreendimento: string | null;
    unidade: string | null;
    valor_venda: number;
    corretor: string | null;
    gerente: string | null;
  } | null;
};

export function ExtratoComissoesTab() {
  const fetcher = useServerFn(listCommissionExtract);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(firstDay.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [role, setRole] = useState<string>("all");
  const [empreendimento, setEmpreendimento] = useState("");
  const [recipientName, setRecipientName] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["commission-extract", from, to, role, empreendimento, recipientName],
    queryFn: () =>
      fetcher({
        data: {
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
          role: role === "all" ? undefined : (role as "corretor" | "gerente" | "diretor"),
          empreendimento: empreendimento.trim() || undefined,
          recipient_name: recipientName.trim() || undefined,
        },
      }),
  });

  const rows: Row[] = (data?.rows ?? []) as Row[];

  const summary = useMemo(() => {
    const byRole = { corretor: 0, gerente: 0, diretor: 0 } as Record<string, number>;
    const byEmp = new Map<string, number>();
    const byPerson = new Map<string, { name: string; role: string; total: number }>();
    let total = 0;
    for (const r of rows) {
      const v = r.valor_pago;
      total += v;
      byRole[r.role] = (byRole[r.role] ?? 0) + v;
      const emp = r.sale?.empreendimento || "—";
      byEmp.set(emp, (byEmp.get(emp) ?? 0) + v);
      const key = `${r.role}::${r.recipient_name ?? "—"}`;
      const cur = byPerson.get(key) ?? {
        name: r.recipient_name ?? "—",
        role: roleLabel(r.role),
        total: 0,
      };
      cur.total += v;
      byPerson.set(key, cur);
    }
    const empRanking = [...byEmp.entries()]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
    const personRanking = [...byPerson.values()].sort((a, b) => b.total - a.total);
    return { total, byRole, empRanking, personRanking };
  }, [rows]);

  const downloadXlsx = () => {
    const detalhe = rows.map((r) => ({
      "Data Pagamento": r.paid_at ? new Date(r.paid_at).toLocaleDateString("pt-BR") : "",
      "Data Venda": fmtBR(r.sale?.data),
      Empreendimento: r.sale?.empreendimento ?? "",
      Unidade: r.sale?.unidade ?? "",
      Cliente: r.sale?.comprador ?? "",
      "Valor Venda": r.sale?.valor_venda ?? 0,
      Papel: roleLabel(r.role),
      Beneficiário: r.recipient_name ?? "",
      Tipo: r.tipo === "adiantamento" ? "Adiantamento" : "Comissão Final",
      "Valor Pago": r.valor_pago,
      Bônus: r.bonus,
      "Desconto Distrato": r.desconto_distrato,
    }));
    const porPessoa = summary.personRanking.map((p) => ({
      Papel: p.role,
      Beneficiário: p.name,
      "Total Recebido": p.total,
    }));
    const porEmp = summary.empRanking.map((e) => ({
      Empreendimento: e.nome,
      "Total Comissões Pagas": e.total,
    }));
    const resumo = [
      { Indicador: "Total Geral", Valor: summary.total },
      { Indicador: "Total Corretores", Valor: summary.byRole.corretor ?? 0 },
      { Indicador: "Total Gerência", Valor: summary.byRole.gerente ?? 0 },
      { Indicador: "Total Gestão", Valor: summary.byRole.diretor ?? 0 },
      { Indicador: "Período", Valor: `${from} a ${to}` },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porPessoa), "Por Beneficiário");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porEmp), "Por Empreendimento");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Detalhado");
    XLSX.writeFile(wb, `extrato-comissoes-${from}_a_${to}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Papel</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="corretor">Corretor</SelectItem>
                <SelectItem value="gerente">Gerência</SelectItem>
                <SelectItem value="diretor">Gestão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Empreendimento</Label>
            <Input
              placeholder="Ex.: Magnific"
              value={empreendimento}
              onChange={(e) => setEmpreendimento(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Beneficiário</Label>
            <Input
              placeholder="Nome do corretor/gerente/gestor"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => refetch()} disabled={isFetching} className="flex-1">
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar"}
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total geral pago" value={BRL(summary.total)} accent="violet" />
        <KpiCard label="Corretores" value={BRL(summary.byRole.corretor ?? 0)} accent="blue" />
        <KpiCard label="Gerência" value={BRL(summary.byRole.gerente ?? 0)} accent="emerald" />
        <KpiCard label="Gestão" value={BRL(summary.byRole.diretor ?? 0)} accent="amber" />
      </div>

      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {rows.length} pagamento(s) no período selecionado
        </div>
        <Button onClick={downloadXlsx} disabled={!rows.length} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Baixar Excel
        </Button>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="w-4 h-4 text-violet-400" />
            <h3 className="font-medium">Empreendimentos — mais pagos</h3>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {summary.empRanking.slice(0, 15).map((e) => (
              <div
                key={e.nome}
                className="flex justify-between text-sm border-b border-border/40 py-1"
              >
                <span className="truncate pr-2">{e.nome}</span>
                <span className="font-medium">{BRL(e.total)}</span>
              </div>
            ))}
            {!summary.empRanking.length && (
              <div className="text-xs text-muted-foreground">Sem dados.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="font-medium">Beneficiários — total recebido</h3>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {summary.personRanking.slice(0, 30).map((p) => (
              <div
                key={`${p.role}-${p.name}`}
                className="flex justify-between text-sm border-b border-border/40 py-1"
              >
                <span className="truncate pr-2">
                  <Badge variant="outline" className="mr-2 text-[10px]">
                    {p.role}
                  </Badge>
                  {p.name}
                </span>
                <span className="font-medium">{BRL(p.total)}</span>
              </div>
            ))}
            {!summary.personRanking.length && (
              <div className="text-xs text-muted-foreground">Sem dados.</div>
            )}
          </div>
        </div>
      </div>

      {/* Detalhado */}
      <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pago em</TableHead>
                <TableHead>Empreendimento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor Venda</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Beneficiário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor Pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </TableCell>
                </TableRow>
              ) : !rows.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum pagamento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{fmtBR(r.paid_at)}</TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {r.sale?.empreendimento ?? "—"}
                      {r.sale?.unidade ? (
                        <span className="text-muted-foreground"> · {r.sale.unidade}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {r.sale?.comprador ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{BRL(r.sale?.valor_venda)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {roleLabel(r.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {r.recipient_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.tipo === "adiantamento" ? "Adiantamento" : "Comissão Final"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{BRL(r.valor_pago)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "violet" | "blue" | "emerald" | "amber";
}) {
  const tone = {
    violet: "from-violet-500/20 to-violet-500/5 text-violet-300 border-violet-500/30",
    blue: "from-blue-500/20 to-blue-500/5 text-blue-300 border-blue-500/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/30",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/30",
  }[accent];
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${tone}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-xl font-semibold mt-1 text-foreground">{value}</div>
    </div>
  );
}
