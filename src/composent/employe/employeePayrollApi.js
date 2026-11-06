import axios from 'axios';

export async function employeePayrollRequest(id, path = '', body, signal) {
  const response = await axios({ method: body === undefined ? 'get' : 'post', url: `http://localhost:7000/Employe/${encodeURIComponent(id)}/${path || 'payroll'}`, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, ...(body === undefined ? {} : { data: body }), signal });
  return response.data;
}
export function employeePayrollError(error) {
  const code = error?.response?.data?.message;
  return /^employee(?:Compensation|Payment|Payroll|Profit)/.test(code || '') ? `employeePayroll.errors.${code}` : 'employeePayroll.errors.employeePayrollFailed';
}
