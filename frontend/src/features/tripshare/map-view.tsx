"use client"

import { MapPin, Search } from "lucide-react"

export function MapView() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative mx-4 mt-2">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
        <input
          placeholder="Search destinations..."
          className="w-full rounded-xl border-0 bg-white py-3.5 pl-10 pr-4 text-sm text-[#0B1C30] shadow-sm ring-1 ring-[#E2E8F0] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
        />
      </div>

      <div className="mx-4 mt-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#003535]">
          <MapPin className="size-4 text-white" />
        </div>
        <span className="text-sm font-medium text-[#0B1C30]">Share My Location</span>
      </div>

      <div className="mx-4 mt-3 flex-1 rounded-xl bg-[#DEE3E3] flex items-center justify-center">
        <p className="text-sm text-[#6B7280]">Map view</p>
      </div>
    </div>
  )
}
