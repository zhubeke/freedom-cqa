import { createRouter, createWebHistory } from "vue-router";
import ConversationsPage from "../pages/conversations/ConversationsPage.vue";
import ConversationDetailPage from "../pages/conversation-detail/ConversationDetailPage.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_ROUTER_BASE ?? "/"),
  routes: [
    { path: "/", redirect: "/conversations" },
    { path: "/conversations", name: "conversations", component: ConversationsPage },
    { path: "/conversations/:id", name: "conversation-detail", component: ConversationDetailPage },
    { path: "/:pathMatch(.*)*", redirect: "/conversations" }
  ]
});
