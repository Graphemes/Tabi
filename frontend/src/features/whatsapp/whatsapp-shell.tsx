"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeIndianRupee,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  User,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/store/auth-store"
import {
  addGroupMember,
  ApiGroup,
  ApiMessage,
  ApiUser,
  createExpense,
  createGroup,
  discoverUsers,
  getFriends,
  getGroups,
  getMessages,
  mobileLogin,
  requestOtp,
  sendFriendRequest,
  sendLocationMessage,
  sendMessage,
  verifyOtp,
} from "@/features/whatsapp/api"

const mobileSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  mobile: z
    .string()
    .min(10, "Enter valid mobile number")
    .regex(/^[+0-9\s-]{10,16}$/, "Only numbers, +, -, spaces"),
})

type MobileSchema = z.infer<typeof mobileSchema>

const groupSchema = z.object({
  groupName: z.string().min(2, "Group name is required"),
})

type GroupSchema = z.infer<typeof groupSchema>

const billSchema = z.object({
  title: z.string().min(2, "Title required"),
  amount: z.number().positive("Amount must be positive"),
})

type BillSchema = z.infer<typeof billSchema>

const formatClock = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))

const displayName = (user?: Pick<ApiUser, "username" | "name" | "email"> | null) => {
  if (!user) {
    return "Unknown"
  }

  return user.name || user.username || user.email.split("@")[0]
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

const messageBody = (message: ApiMessage) => message.content || message.mediaUrl || ""

export function WhatsappShell() {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((state) => state.accessToken)
  const authUser = useAuthStore((state) => state.user)
  const setAuth = useAuthStore((state) => state.setAuth)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [messageText, setMessageText] = useState("")
  const [searchText, setSearchText] = useState("")
  const [contactsSynced, setContactsSynced] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([])
  const [loginStep, setLoginStep] = useState<"phone" | "otp">("phone")
  const [pendingPhone, setPendingPhone] = useState("")
  const [pendingName, setPendingName] = useState("")
  const [otpValue, setOtpValue] = useState("")

  const loginForm = useForm<MobileSchema>({
    resolver: zodResolver(mobileSchema),
    defaultValues: { name: "", mobile: "" },
  })

  const groupForm = useForm<GroupSchema>({
    resolver: zodResolver(groupSchema),
    defaultValues: { groupName: "" },
  })

  const billForm = useForm<BillSchema>({
    resolver: zodResolver(billSchema),
    defaultValues: { title: "", amount: 0 },
  })

  const requestOtpMutation = useMutation({
    mutationFn: (payload: { phone: string; name?: string }) => requestOtp(payload),
    onSuccess: () => {
      setLoginStep("otp")
    },
  })

  const verifyOtpMutation = useMutation({
    mutationFn: verifyOtp,
    onSuccess: (data) => {
      setAuth({
        accessToken: data.access_token,
        user: {
          ...data.user,
          phone: data.phone,
          name: pendingName,
        },
      })
    },
  })

  const friendsQuery = useQuery({
    queryKey: ["friends"],
    enabled: Boolean(accessToken),
    queryFn: getFriends,
  })

  const contactsQuery = useQuery({
    queryKey: ["friends", "discover", searchText],
    enabled: Boolean(accessToken && contactsSynced),
    queryFn: () => discoverUsers(searchText),
  })

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    enabled: Boolean(accessToken),
    queryFn: getGroups,
  })

  const selectedGroup = useMemo(
    () => groupsQuery.data?.find((group) => group.id === selectedGroupId) ?? null,
    [groupsQuery.data, selectedGroupId],
  )

  const messagesQuery = useQuery({
    queryKey: ["groups", selectedGroupId, "messages"],
    enabled: Boolean(accessToken && selectedGroupId),
    queryFn: () => getMessages(Number(selectedGroupId)),
  })

  const createGroupMutation = useMutation({
    mutationFn: async ({ name, memberIds }: { name: string; memberIds: number[] }) => {
      const group = await createGroup({ name })
      await Promise.all(memberIds.map((memberId) => addGroupMember(group.id, memberId)))
      return group
    },
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] })
      setSelectedGroupId(group.id)
      setSelectedFriendIds([])
      groupForm.reset()
    },
  })

  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["friends"] }),
        queryClient.invalidateQueries({ queryKey: ["friends", "discover"] }),
      ])
    },
  })

  const sendTextMutation = useMutation({
    mutationFn: async ({ groupId, content }: { groupId: number; content: string }) => {
      const socket = getSocket(accessToken)
      if (socket.connected) {
        socket.emit("message:send", {
          groupId,
          message: { type: "TEXT", content },
        })
        return null
      }

      return sendMessage(groupId, { type: "TEXT", content })
    },
    onSuccess: async () => {
      setMessageText("")
      await queryClient.invalidateQueries({ queryKey: ["groups", selectedGroupId, "messages"] })
    },
  })

  const sendLocationMutation = useMutation({
    mutationFn: sendLocationMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups", selectedGroupId, "messages"] })
    },
  })

  const billMutation = useMutation({
    mutationFn: async ({ group, title, amount }: { group: ApiGroup; title: string; amount: number }) => {
      if (!authUser) {
        throw new Error("Login required")
      }

      await createExpense(group, authUser.id, { title, amount })
      return sendMessage(group.id, {
        type: "TEXT",
        content: `BILL::${title}::${amount.toFixed(2)}::${group.defaultCurrency || "USD"}`,
      })
    },
    onSuccess: async () => {
      billForm.reset({ title: "", amount: 0 })
      await queryClient.invalidateQueries({ queryKey: ["groups", selectedGroupId, "messages"] })
    },
  })

  useEffect(() => {
    if (!accessToken) {
      return
    }

    const socket = getSocket(accessToken)
    const onMessage = (message: ApiMessage) => {
      queryClient.setQueryData<ApiMessage[]>(
        ["groups", message.groupId, "messages"],
        (current = []) => {
          if (current.some((item) => item.id === message.id)) {
            return current
          }
          return [...current, message]
        },
      )
      void queryClient.invalidateQueries({ queryKey: ["groups"] })
    }

    socket.on("message:new", onMessage)
    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off("message:new", onMessage)
    }
  }, [accessToken, queryClient])

  useEffect(() => {
    if (!accessToken || !selectedGroupId) {
      return
    }

    const socket = getSocket(accessToken)
    socket.emit("group:join", { groupId: selectedGroupId })

    return () => {
      socket.emit("group:leave", { groupId: selectedGroupId })
    }
  }, [accessToken, selectedGroupId])

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data])
  const friends = useMemo(
    () => (friendsQuery.data ?? []).map((item) => item.friend),
    [friendsQuery.data],
  )
  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data])
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data])

  const visibleGroups = useMemo(() => {
    if (!searchText.trim()) {
      return groups
    }

    const query = searchText.toLowerCase()
    return groups.filter((group) => group.name.toLowerCase().includes(query))
  }, [groups, searchText])

  if (!accessToken || !authUser) {
    if (loginStep === "otp") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_15%_10%,#e7f9f4,transparent_35%),radial-gradient(circle_at_85%_20%,#e4f2ff,transparent_35%),linear-gradient(140deg,#f4fff9,#f8fafc)] p-4">
          <Card className="w-full max-w-md border-emerald-200/70 bg-white/90 shadow-xl shadow-emerald-900/10 backdrop-blur">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep("phone")
                    setOtpValue("")
                    requestOtpMutation.reset()
                  }}
                  className="-ml-1 rounded-full p-1 text-muted-foreground hover:bg-emerald-100"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <CardTitle className="text-2xl">Enter OTP</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                OTP sent to <span className="font-medium text-foreground">{pendingPhone}</span>
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">6-digit OTP</label>
                  <Input
                    placeholder="000000"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    className="text-center text-2xl tracking-[0.5em]"
                    autoFocus
                  />
                </div>

                {verifyOtpMutation.isError ? (
                  <p className="text-sm text-destructive">
                    {verifyOtpMutation.error?.message || "Invalid or expired OTP"}
                  </p>
                ) : null}

                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={otpValue.length < 4 || verifyOtpMutation.isPending}
                  onClick={() => verifyOtpMutation.mutate({ phone: pendingPhone, otp: otpValue })}
                >
                  {verifyOtpMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Verify OTP
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_15%_10%,#e7f9f4,transparent_35%),radial-gradient(circle_at_85%_20%,#e4f2ff,transparent_35%),linear-gradient(140deg,#f4fff9,#f8fafc)] p-4">
        <Card className="w-full max-w-md border-emerald-200/70 bg-white/90 shadow-xl shadow-emerald-900/10 backdrop-blur">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Welcome to Tabi Chat</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter your details to receive a one-time password.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={loginForm.handleSubmit((values) => {
                setPendingName(values.name)
                setPendingPhone(values.mobile)
                requestOtpMutation.mutate({ name: values.name, phone: values.mobile })
              })}
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input placeholder="Your full name" {...loginForm.register("name")} />
                {loginForm.formState.errors.name ? (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.name.message}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mobile Number</label>
                <Input placeholder="+91 98XXXXXXXX" {...loginForm.register("mobile")} />
                {loginForm.formState.errors.mobile ? (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.mobile.message}</p>
                ) : null}
              </div>

              {requestOtpMutation.isError ? (
                <p className="text-sm text-destructive">
                  {requestOtpMutation.error?.message || "Could not send OTP. Check backend is running."}
                </p>
              ) : null}

              <Button
                type="submit"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Send OTP
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-3 sm:p-4">
      <div className="mx-auto grid h-[calc(100vh-1.5rem)] max-w-7xl grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-emerald-100 bg-white/90 shadow-xl shadow-emerald-900/10 backdrop-blur md:grid-cols-[330px_1fr]">
        <aside className="flex flex-col border-r border-emerald-100">
          <div className="flex items-center justify-between border-b border-emerald-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                {initials(displayName(authUser))}
              </div>
              <div>
                <p className="text-sm font-semibold">{displayName(authUser)}</p>
                <p className="text-xs text-muted-foreground">{authUser.phone || authUser.mobile || authUser.email}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={clearAuth}>
              Logout
            </Button>
          </div>

          <div className="space-y-2 border-b border-emerald-100 p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search groups or contacts"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>

            <form
              className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/70 p-2.5"
              onSubmit={groupForm.handleSubmit((values) => {
                createGroupMutation.mutate({
                  name: values.groupName,
                  memberIds: selectedFriendIds,
                })
              })}
            >
              <div className="flex items-center gap-2">
                <Users className="size-4 text-emerald-700" />
                <p className="text-xs font-semibold tracking-[0.12em] text-emerald-700 uppercase">
                  Create Group
                </p>
              </div>
              <Input placeholder="Trip group name" className="bg-white" {...groupForm.register("groupName")} />
              <div className="max-h-20 space-y-1 overflow-y-auto rounded-md bg-white p-2">
                {friends.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Add friends first.</p>
                ) : (
                  friends.map((friend) => {
                    const checked = selectedFriendIds.includes(friend.id)
                    return (
                      <label key={friend.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedFriendIds((prev) =>
                              checked ? prev.filter((id) => id !== friend.id) : [...prev, friend.id],
                            )
                          }}
                        />
                        {displayName(friend)}
                      </label>
                    )
                  })
                )}
              </div>
              <Button
                type="submit"
                size="sm"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={createGroupMutation.isPending || selectedFriendIds.length === 0}
              >
                {createGroupMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create Group
              </Button>
            </form>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groupsQuery.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading groups...</p>
            ) : visibleGroups.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No groups yet.</p>
            ) : (
              visibleGroups
                .slice()
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`mb-1.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                      selectedGroupId === group.id ? "bg-emerald-100" : "hover:bg-emerald-50"
                    }`}
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-emerald-200 text-lg">
                      🧳
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{group.name}</p>
                      <p className="text-xs text-muted-foreground">{group.members.length} members</p>
                    </div>
                  </button>
                ))
            )}
          </div>
        </aside>

        <main className="grid min-h-0 grid-rows-[auto_1fr_auto]">
          <header className="flex items-center justify-between border-b border-emerald-100 px-4 py-3">
            <div>
              <p className="text-base font-semibold">{selectedGroup ? selectedGroup.name : "Select a chat"}</p>
              <p className="text-xs text-muted-foreground">
                {selectedGroup ? `${selectedGroup.members.length} participants` : "Create/select group to start"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setContactsSynced(true)}>
              <Phone className="size-4" />
              {contactsSynced ? "Contacts Synced" : "Sync Contacts"}
            </Button>
          </header>

          <section className="grid min-h-0 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1fr_300px]">
            <div className="relative min-h-0 overflow-y-auto rounded-xl border border-emerald-100 bg-[linear-gradient(180deg,#f5fffb_0%,#f9fcff_100%)] p-3">
              {!selectedGroup ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Pick a group from left panel.
                </div>
              ) : messagesQuery.isLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading messages...
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((message) => {
                    const mine = message.senderId === authUser.id
                    const content = messageBody(message)
                    const billParts = content.startsWith("BILL::") ? content.split("::") : null
                    return (
                      <div
                        key={message.id}
                        className={`max-w-[82%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                          mine ? "ml-auto bg-emerald-500 text-white" : "bg-white text-slate-800"
                        }`}
                      >
                        {message.type === "LOCATION" ? (
                          <a href={content} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                            <MapPin className="size-4" />
                            Open shared location
                            <ArrowUpRight className="size-3" />
                          </a>
                        ) : billParts ? (
                          <p className="inline-flex items-center gap-1">
                            <BadgeIndianRupee className="size-4" />
                            {billParts[1]} - {billParts[3]} {billParts[2]} split in group
                          </p>
                        ) : (
                          <p>{content}</p>
                        )}
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/80" : "text-slate-500"}`}>
                          {formatClock(message.createdAt)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="min-h-0 space-y-3 overflow-y-auto">
              <Card className="border-emerald-100">
                <CardHeader>
                  <CardTitle className="text-sm">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium">{displayName(authUser)}</p>
                  <p className="text-muted-foreground">{authUser.phone || authUser.mobile || authUser.email}</p>
                  <p className="text-muted-foreground">Connected to backend</p>
                </CardContent>
              </Card>

              <Card className="border-emerald-100">
                <CardHeader>
                  <CardTitle className="text-sm">Friends</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {friends.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No friends yet.</p>
                  ) : (
                    friends.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between text-sm">
                        <span>{displayName(friend)}</span>
                        <span className="text-xs text-muted-foreground">#{friend.id}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-emerald-100">
                <CardHeader>
                  <CardTitle className="text-sm">Add Friends From Contacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!contactsSynced ? (
                    <p className="text-sm text-muted-foreground">Sync contacts to discover backend users.</p>
                  ) : contactsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Finding users...</p>
                  ) : contacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users found. Create another mobile login user in another browser/session.</p>
                  ) : (
                    contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <p>{displayName(contact)}</p>
                          <p className="text-xs text-muted-foreground">{contact.email}</p>
                        </div>
                        <Button
                          size="xs"
                          variant={contact.isFriend ? "secondary" : "outline"}
                          disabled={contact.isFriend || contact.hasPendingRequest || friendRequestMutation.isPending}
                          onClick={() => friendRequestMutation.mutate(contact.id)}
                        >
                          {contact.isFriend ? "Added" : contact.hasPendingRequest ? "Pending" : "Add"}
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <footer className="space-y-2 border-t border-emerald-100 p-3">
            <div className="flex gap-2">
              <Input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={selectedGroup ? "Type a message" : "Select a group first"}
                disabled={!selectedGroup}
              />
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={!selectedGroup || !messageText.trim() || sendTextMutation.isPending}
                onClick={() => {
                  if (!selectedGroup || !messageText.trim()) return
                  sendTextMutation.mutate({ groupId: selectedGroup.id, content: messageText.trim() })
                }}
              >
                <Send className="size-4" />
                Send
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <form
                className="flex gap-2"
                onSubmit={billForm.handleSubmit((values) => {
                  if (!selectedGroup) return
                  billMutation.mutate({ group: selectedGroup, title: values.title, amount: values.amount })
                })}
              >
                <Input placeholder="Bill title" disabled={!selectedGroup} {...billForm.register("title")} />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  disabled={!selectedGroup}
                  {...billForm.register("amount", { valueAsNumber: true })}
                />
                <Button type="submit" variant="outline" disabled={!selectedGroup || billMutation.isPending}>
                  <BadgeIndianRupee className="size-4" />
                  Add Bill
                </Button>
              </form>

              <Button
                variant="outline"
                disabled={!selectedGroup || sendLocationMutation.isPending}
                onClick={() => {
                  if (!selectedGroup) return
                  sendLocationMutation.mutate(selectedGroup.id)
                }}
              >
                <MapPin className="size-4" />
                Send Location
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="size-3" />
              Auth, friends, groups, messages, bills and location are connected to backend APIs.
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}
