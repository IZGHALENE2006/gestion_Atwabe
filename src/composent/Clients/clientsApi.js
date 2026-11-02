import axios from "axios";

const api = `${import.meta.env.VITE_API_URL || "http://localhost:7000"}/clients`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
export const loadClients = async (signal) => (await axios.get(api, { headers: headers(), signal })).data;
export const saveClient = async (client, id) => (id
  ? await axios.put(`${api}/${encodeURIComponent(id)}`, client, { headers: headers() })
  : await axios.post(api, client, { headers: headers() })).data;
