/**
 * Company mode: one page, /org/*, whose nested routes are company's own (org-routes.tsx); the
 * company state's provider, mounted for the signed-in session; the handler that fans the
 * scheduler's events out to it; and the sidebar's company work mode with its three sections
 * (sidebar-mode.tsx).
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { OrgRoutes } from "./org-routes";
import { CompanyProvider, companyUserEvents } from "./company-state";
import { companyChannels, companyDesks, companyMode, companySwitcher } from "./sidebar-mode";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "company.org",
        key: "org",
        path: "/org/*",
        frame: "shell",
        nav: "none",
        admin: false,
        released: true,
        order: 120,
      },
    ],
    "ShellModule.sessionProviders": [{ id: "company.provider", order: 10 }],
    "SessionsModule.userEvents": [{ id: "company.events", order: 10 }],
    "SidebarModule.modes": [
      {
        id: "company.mode",
        key: "company",
        title: "Company",
        titleZh: "公司",
        icon: "building",
        order: 10,
      },
    ],
    "SidebarModule.sections": [
      { id: "company.switcher", mode: "company", place: "header", order: 10 },
      { id: "company.channels", mode: "company", place: "body", order: 20 },
      { id: "company.desks", mode: "company", place: "body", order: 30 },
    ],
  },
})
export class CompanyModule {
  @Bind("company.org") org = OrgRoutes;
  @Bind("company.provider") provider = CompanyProvider;
  @Bind("company.events") events = companyUserEvents;
  @Bind("company.mode") mode = companyMode;
  @Bind("company.switcher") switcher = companySwitcher;
  @Bind("company.channels") channels = companyChannels;
  @Bind("company.desks") desks = companyDesks;
}
