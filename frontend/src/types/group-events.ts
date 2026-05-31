import { CreateMessageDto } from "@/types/message"
import { UpdateLiveLocationDto } from "@/types/location"

export type GroupJoinPayload = {
  groupId: number
}

export type MessageSendPayload = {
  groupId: number
  message: CreateMessageDto
}

export type TypingPayload = {
  groupId: number
}

export type LocationTogglePayload = {
  groupId: number
  payload: {
    enabled: boolean
  }
}

export type LocationUpdatePayload = {
  groupId: number
  payload: UpdateLiveLocationDto
}
