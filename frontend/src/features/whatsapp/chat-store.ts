import { create } from "zustand"

type MessageType = "text" | "bill" | "location" | "system"

export type ChatUser = {
  id: number
  name: string
  mobile: string
  avatarColor: string
  about?: string
}

export type Contact = {
  id: number
  name: string
  mobile: string
  isFriend: boolean
}

export type Group = {
  id: number
  name: string
  memberIds: number[]
  photoEmoji: string
  updatedAt: string
}

export type ChatMessage = {
  id: number
  groupId: number
  senderId: number
  type: MessageType
  content: string
  createdAt: string
}

type LoginPayload = {
  name: string
  mobile: string
}

type ChatState = {
  me: ChatUser | null
  contactsSynced: boolean
  contacts: Contact[]
  friends: ChatUser[]
  groups: Group[]
  messages: ChatMessage[]
  login: (payload: LoginPayload) => void
  logout: () => void
  syncContacts: () => void
  addFriendFromContact: (contactId: number) => void
  createGroup: (name: string, memberIds: number[]) => Group
  sendMessage: (groupId: number, senderId: number, type: MessageType, content: string) => void
}

const now = () => new Date().toISOString()

const seededFriends: ChatUser[] = [
  { id: 2, name: "Aarav", mobile: "+91 98989 11111", avatarColor: "#0ea5e9", about: "Always travel ready" },
  { id: 3, name: "Mia", mobile: "+91 98989 22222", avatarColor: "#22c55e", about: "Food and photos" },
  { id: 4, name: "Kabir", mobile: "+91 98989 33333", avatarColor: "#f97316", about: "Road trip mode" },
]

const seededContacts: Contact[] = [
  { id: 2, name: "Aarav", mobile: "+91 98989 11111", isFriend: true },
  { id: 3, name: "Mia", mobile: "+91 98989 22222", isFriend: true },
  { id: 4, name: "Kabir", mobile: "+91 98989 33333", isFriend: true },
  { id: 5, name: "Priya", mobile: "+91 98989 44444", isFriend: false },
  { id: 6, name: "Noah", mobile: "+91 98989 55555", isFriend: false },
  { id: 7, name: "Zoya", mobile: "+91 98989 66666", isFriend: false },
]

export const useChatStore = create<ChatState>((set, get) => ({
  me: null,
  contactsSynced: false,
  contacts: [],
  friends: seededFriends,
  groups: [],
  messages: [],

  login: ({ name, mobile }) => {
    const me: ChatUser = {
      id: 1,
      name,
      mobile,
      avatarColor: "#8b5cf6",
      about: "Exploring with Tabi",
    }

    const starterGroup: Group = {
      id: 101,
      name: "Goa Trip Crew",
      memberIds: [1, 2, 3],
      photoEmoji: "🏖️",
      updatedAt: now(),
    }

    const starterMessages: ChatMessage[] = [
      {
        id: 9001,
        groupId: starterGroup.id,
        senderId: 2,
        type: "text",
        content: "Flights booked. Let's split fuel and stay in app.",
        createdAt: now(),
      },
      {
        id: 9002,
        groupId: starterGroup.id,
        senderId: 3,
        type: "location",
        content:
          "https://www.google.com/maps/search/?api=1&query=15.4989,73.8278",
        createdAt: now(),
      },
    ]

    set({
      me,
      groups: [starterGroup],
      messages: starterMessages,
    })
  },

  logout: () => {
    set({
      me: null,
      contactsSynced: false,
      contacts: [],
      groups: [],
      messages: [],
      friends: seededFriends,
    })
  },

  syncContacts: () => {
    set({
      contactsSynced: true,
      contacts: seededContacts,
    })
  },

  addFriendFromContact: (contactId: number) => {
    const { contacts, friends } = get()
    const contact = contacts.find((item) => item.id === contactId)
    if (!contact || contact.isFriend) {
      return
    }

    const updatedContacts = contacts.map((item) =>
      item.id === contactId ? { ...item, isFriend: true } : item,
    )

    const nextFriend: ChatUser = {
      id: contact.id,
      name: contact.name,
      mobile: contact.mobile,
      avatarColor: "#14b8a6",
      about: "Added from contacts",
    }

    set({
      contacts: updatedContacts,
      friends: [...friends, nextFriend],
    })
  },

  createGroup: (name: string, memberIds: number[]) => {
    const me = get().me
    if (!me) {
      throw new Error("Login required")
    }

    const group: Group = {
      id: Date.now(),
      name,
      memberIds: [me.id, ...memberIds],
      photoEmoji: "🧳",
      updatedAt: now(),
    }

    set((state) => ({
      groups: [group, ...state.groups],
      messages: [
        {
          id: Date.now() + 1,
          groupId: group.id,
          senderId: me.id,
          type: "system",
          content: `${me.name} created this group`,
          createdAt: now(),
        },
        ...state.messages,
      ],
    }))

    return group
  },

  sendMessage: (groupId, senderId, type, content) => {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: Date.now(),
          groupId,
          senderId,
          type,
          content,
          createdAt: now(),
        },
      ],
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, updatedAt: now() } : group,
      ),
    }))
  },
}))
