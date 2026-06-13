export interface Approval {
  cliente: string;
  cpf?: string;
  dataEntrada: string;
  corretor: string;
  empreendimento: string;
  unidade?: string;
  valor?: number | string;
  status?: string;
  carta?: string;
  [key: string]: unknown;
}
