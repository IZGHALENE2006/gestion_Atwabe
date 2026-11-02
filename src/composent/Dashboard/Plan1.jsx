import { Line } from "react-chartjs-2";
export default function Plan1({ data, options }) {
  return (
    <div className="h-80 w-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">

        </div>

      </div>
      <div className="flex-1">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}