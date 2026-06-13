"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Camera, Loader2, Trash2 } from "lucide-react"
import { useAuthStore } from "@/store/auth-store"
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from "@/features/whatsapp/api"

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

type Props = {
  onBack: () => void
}

type ProfileForm = {
  name: string
  username: string
  email: string
  phone: string
}

type PasswordForm = {
  currentPassword: string
  newPassword: string
}

export function ProfilePage({ onBack }: Props) {
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)
  const authUser = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const [form, setForm] = useState<ProfileForm>({
    name: "",
    username: "",
    email: "",
    phone: "",
  })
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
  })
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  })

  useEffect(() => {
    if (profileQuery.data) {
      setForm({
        name: profileQuery.data.name || "",
        username: profileQuery.data.username || "",
        email: profileQuery.data.email || "",
        phone: profileQuery.data.phone || "",
      })
    }
  }, [profileQuery.data])

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["profile"] })
      if (authUser) {
        setAuth({
          accessToken: useAuthStore.getState().accessToken!,
          user: {
            ...authUser,
            name: data.name || authUser.name,
            username: data.username,
            email: data.email,
            phone: data.phone || authUser.phone,
          },
        })
      }
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setPasswordForm({ currentPassword: "", newPassword: "" })
      setShowPasswordForm(false)
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      clearAuth()
    },
  })

  const hasChanges =
    form.name !== (profileQuery.data?.name || "") ||
    form.username !== (profileQuery.data?.username || "") ||
    form.email !== (profileQuery.data?.email || "") ||
    form.phone !== (profileQuery.data?.phone || "")

  const displayName = form.name || profileQuery.data?.username || "User"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <button type="button" onClick={onBack} className="rounded-full p-1 text-[#404848] hover:bg-[#DCE9FF]">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-bold text-[#003535]">Profile</h1>
      </header>

      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-6">
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="relative">
            <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#D3E4FE] shadow-lg">
              <span className="text-2xl font-bold text-[#0B1C30]">
                {initials(displayName)}
              </span>
            </div>
            <div className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-white bg-[#FE6B00] text-white shadow">
              <Camera className="size-4" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-[#0B1C30]">{displayName}</h2>
          <p className="-mt-1 text-sm text-[#6B7280]">@{profileQuery.data?.username}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">FULL NAME</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Your full name"
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">USERNAME</label>
            <input
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              placeholder="@username"
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">EMAIL</label>
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="email@example.com"
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">PHONE</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+1 234 567 8900"
              className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
            />
          </div>
        </div>

        {updateMutation.isError && (
          <p className="text-sm text-red-500">
            {updateMutation.error?.message || "Could not save changes"}
          </p>
        )}

        {updateMutation.isSuccess && (
          <p className="text-sm text-emerald-600">Profile updated</p>
        )}

        <button
          type="button"
          disabled={!hasChanges || updateMutation.isPending}
          onClick={() => updateMutation.mutate(form)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#003535] py-3.5 text-sm font-semibold text-white transition hover:bg-[#002828] disabled:opacity-50"
        >
          {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save Changes
        </button>

        <div className="space-y-3">
          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => setShowPasswordForm(true)}
              className="w-full rounded-xl border border-[#E2E8F0] bg-white py-3.5 text-sm font-semibold text-[#003535] transition hover:bg-[#F1F4F9]"
            >
              Change Password
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">CURRENT PASSWORD</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="Current password"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8F9FF] px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-[0.05em] text-[#6B7280]">NEW PASSWORD</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                  placeholder="New password (min 6 chars)"
                  className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8F9FF] px-4 py-3 text-sm text-[#0B1C30] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#FE6B00]/30"
                />
              </div>

              {changePasswordMutation.isError && (
                <p className="text-sm text-red-500">
                  {changePasswordMutation.error?.message || "Could not change password"}
                </p>
              )}
              {changePasswordMutation.isSuccess && (
                <p className="text-sm text-emerald-600">Password changed</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowPasswordForm(false); setPasswordForm({ currentPassword: "", newPassword: "" }) }}
                  className="flex-1 rounded-xl border border-[#E2E8F0] py-3 text-sm font-semibold text-[#404848] transition hover:bg-[#F1F4F9]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!passwordForm.currentPassword || !passwordForm.newPassword || changePasswordMutation.isPending}
                  onClick={() => changePasswordMutation.mutate(passwordForm)}
                  className="flex-1 rounded-xl bg-[#003535] py-3 text-sm font-semibold text-white transition hover:bg-[#002828] disabled:opacity-50"
                >
                  {changePasswordMutation.isPending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Update"}
                </button>
              </div>
            </div>
          )}

          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3.5 text-sm font-semibold text-red-500 transition hover:bg-red-50"
            >
              <Trash2 className="size-4" />
              Delete Account
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-600">Are you sure?</p>
              <p className="mt-1 text-xs text-red-500">This action cannot be undone.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="flex-1 rounded-xl border border-[#E2E8F0] bg-white py-2.5 text-sm font-semibold text-[#404848] transition hover:bg-[#F1F4F9]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteAccountMutation.isPending}
                  onClick={() => deleteAccountMutation.mutate()}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteAccountMutation.isPending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
