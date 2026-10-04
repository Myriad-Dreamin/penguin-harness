/** The benchmarks list and one benchmark's detail. */
import { Bind, Module } from "@prismshadow/penguin-core/kernel/runtime";
import { lazyComponent } from "../../lib/lazy-component";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "benchmark.list",
        key: "benchmark",
        path: "/benchmark",
        frame: "shell",
        nav: "main",
        admin: false,
        released: true,
        order: 70,
        title: "Evaluation Center",
        titleZh: "评估中心",
        icon: "trophy",
      },
      {
        id: "benchmark.detail",
        key: "benchmark-detail",
        path: "/benchmark/:benchmarkId",
        frame: "shell",
        nav: "none",
        admin: false,
        released: true,
        order: 71,
      },
    ],
  },
})
export class BenchmarkModule {
  @Bind("benchmark.list") list = lazyComponent(() => import("./benchmark-page"), "BenchmarkPage");
  @Bind("benchmark.detail") detail = lazyComponent(
    () => import("./benchmark-detail-page"),
    "BenchmarkDetailPage",
  );
}
