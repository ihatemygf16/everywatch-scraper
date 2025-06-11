export default function StatBox({ label, value }) {
  return (
    <div className="bg-[#030712] text-[#F9FAFA] rounded-lg p-4 shadow w-1/5 min-w-[150px] text-center">
      <div className="text-sm text-[#CBD5E1] font-medium">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}