export type MessageType = "TEXT" | "IMAGE" | "VIDEO" | "LOCATION" | "SYSTEM"

export type CreateMessageDto = {
  type?: MessageType
  content?: string
  mediaUrl?: string
  latitude?: number
  longitude?: number
  mapLabel?: string
}
