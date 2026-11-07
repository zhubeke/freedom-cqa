import { createApp } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import "./styles/main.css";
import App from "./app/App.vue";
import { router } from "./app/router";

const app = createApp(App);

app.use(router);
app.use(VueQueryPlugin);
app.mount("#app");
