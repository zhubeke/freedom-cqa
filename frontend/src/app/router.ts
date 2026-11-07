import { createRouter, createWebHistory } from "vue-router";
import ConversationsPage from "../pages/conversations/ConversationsPage.vue";
import ConversationDetailPage from "../pages/conversation-detail/ConversationDetailPage.vue";
import ChecklistsPage from "../pages/checklists/ChecklistsPage.vue";
import ChecklistBuilderPage from "../pages/checklist-builder/ChecklistBuilderPage.vue";
import DashboardPage from "../pages/dashboard/DashboardPage.vue";
import ReviewsPage from "../pages/reviews/ReviewsPage.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_ROUTER_BASE ?? "/"),
  routes: [
    { path: "/", redirect: "/conversations" },
    { path: "/conversations", name: "conversations", component: ConversationsPage },
    { path: "/conversations/:id", name: "conversation-detail", component: ConversationDetailPage },
    { path: "/checklists", name: "checklists", component: ChecklistsPage },
    { path: "/checklists/:id/edit", name: "checklist-edit", component: ChecklistBuilderPage },
    { path: "/dashboard", name: "dashboard", component: DashboardPage },
    { path: "/reviews", name: "reviews", component: ReviewsPage },
    { path: "/:pathMatch(.*)*", redirect: "/conversations" }
  ]
});
