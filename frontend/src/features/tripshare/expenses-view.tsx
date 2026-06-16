"use client";

export function ExpensesView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="size-16 rounded-2xl bg-[#DCE9FF] flex items-center justify-center">
        <span className="text-2xl">💰</span>
      </div>
      <h3 className="text-lg font-semibold text-[#0B1C30]">Expenses</h3>
      <p className="max-w-xs text-sm text-[#6B7280]">
        Track and split expenses with your group members
      </p>
    </div>
  );
}
