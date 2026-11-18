import { SavedChatsFrame } from '@/components/chat/saved-chats-frame';
import { SavedChatsSkeleton } from '@/components/chat/saved-chats-skeleton';

export default function SavedChatsLoading() {
  return <SavedChatsFrame><SavedChatsSkeleton /></SavedChatsFrame>;
}
