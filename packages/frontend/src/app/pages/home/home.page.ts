import { Component, ViewChild, AfterViewInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateService } from "@ngx-translate/core";
import {
  NavController,
  AlertController,
  ToastController,
  PopoverController,
  NavParams,
} from "@ionic/angular";
import { Datasource } from "ngx-ui-scroll";

import {
  RecipeService,
  Recipe,
  RecipeFolderName,
} from "~/services/recipe.service";
import { MessagingService } from "~/services/messaging.service";
import { UserProfile, UserService } from "~/services/user.service";
import { LoadingService } from "~/services/loading.service";
import { WebsocketService } from "~/services/websocket.service";
import { EventService } from "~/services/event.service";
import { UtilService, RouteMap, AuthType } from "~/services/util.service";

import { LabelService, Label } from "~/services/label.service";
import {
  PreferencesService,
  MyRecipesPreferenceKey,
  GlobalPreferenceKey,
} from "~/services/preferences.service";
import { HomePopoverPage } from "~/pages/home-popover/home-popover.page";
import { HomeSearchFilterPopoverPage } from "~/pages/home-search-popover/home-search-filter-popover.page";
import { TRPCService } from "~/services/trpc.service";
import { TRPCError } from "@trpc/server";

const TILE_WIDTH = 200;
const TILE_PADD = 20;

@Component({
  selector: "page-home",
  templateUrl: "home.page.html",
  styleUrls: ["home.page.scss"],
})
export class HomePage {
  defaultBackHref: string = RouteMap.PeoplePage.getPath();
  showBack: boolean = false;

  labels: Label[] = [];
  selectedLabels: string[] = [];

  recipes: Recipe[] = [];
  recipeFetchBuffer = 25;
  fetchPerPage = 50;
  lastRecipeCount = 0;
  totalRecipeCount: number;

  loading = true;
  selectedRecipeIds: string[] = [];
  selectionMode = false;

  searchText = "";

  folder: RecipeFolderName;

  preferences = this.preferencesService.preferences;
  preferenceKeys = MyRecipesPreferenceKey;

  reloadPending = true;

  userId = null;

  myProfile: UserProfile;
  friendsById: {
    [key: string]: UserProfile;
  };
  otherUserProfile: UserProfile;

  ratingFilter: (number | null)[] = [];

  tileColCount: number;

  datasource = new Datasource<Recipe>({
    get: async (index: number, count: number) => {
      const isTiled =
        this.preferences[MyRecipesPreferenceKey.ViewType] === "tiles";
      if (isTiled) {
        index = index * this.tileColCount;
        count = count * this.tileColCount;
      }

      await this.fetchMoreRecipes(index + count);

      const recipes = this.recipes.slice(index, index + count);

      if (isTiled) {
        const recipeGroups = [];
        const groupCount = recipes.length / this.tileColCount;

        for (let i = 0; i < groupCount; i++) {
          const recipeIdx = i * this.tileColCount;
          recipeGroups.push(
            recipes.slice(recipeIdx, recipeIdx + this.tileColCount)
          );
        }

        return recipeGroups;
      }

      return recipes;
    },
    settings: {
      minIndex: 0,
      startIndex: 0,
      bufferSize: 25,
      padding: 5,
    },
  });

  constructor(
    public navCtrl: NavController,
    public route: ActivatedRoute,
    public router: Router,
    public events: EventService,
    public translate: TranslateService,
    public popoverCtrl: PopoverController,
    public loadingService: LoadingService,
    public alertCtrl: AlertController,
    public toastCtrl: ToastController,
    public recipeService: RecipeService,
    public labelService: LabelService,
    public userService: UserService,
    public utilService: UtilService,
    public preferencesService: PreferencesService,
    public websocketService: WebsocketService,
    public messagingService: MessagingService,
    public trpcService: TRPCService
  ) {
    this.showBack = !!this.router.getCurrentNavigation().extras.state?.showBack;

    this.folder =
      (this.route.snapshot.paramMap.get("folder") as RecipeFolderName) ||
      "main";
    this.selectedLabels = (
      this.route.snapshot.queryParamMap.get("labels") || ""
    )
      .split(",")
      .filter((e) => e);
    this.userId = this.route.snapshot.queryParamMap.get("userId") || null;
    if (this.userId) {
      this.showBack = true;
      this.userService
        .getProfileByUserId(this.userId)
        .then((profileResponse) => {
          if (!profileResponse.success) return;
          this.otherUserProfile = profileResponse.data;
        });
    }
    this.setDefaultBackHref();

    events.subscribe("recipe:update", () => (this.reloadPending = true));
    events.subscribe("label:update", () => (this.reloadPending = true));
    events.subscribe("import:pepperplate:complete", () => {
      const loading = this.loadingService.start();
      this.resetAndLoadAll().then(
        () => {
          loading.dismiss();
        },
        () => {
          loading.dismiss();
        }
      );
    });

    this.websocketService.register(
      "messages:new",
      (payload) => {
        if (payload.recipe && this.folder === "inbox") {
          this.resetAndLoadRecipes();
        }
      },
      this
    );

    this.updateTileColCount();

    window.addEventListener("resize", () => this.updateTileColCount());
  }

  async ionViewWillEnter() {
    this.clearSelectedRecipes();

    if (this.reloadPending) {
      const loading = this.loadingService.start();
      this.resetAndLoadAll().then(
        () => {
          loading.dismiss();
        },
        () => {
          loading.dismiss();
        }
      );
    }

    this.fetchMyProfile();
    this.fetchFriends();
  }

  async setDefaultBackHref() {
    if (this.userId) {
      const response = await this.userService.getProfileByUserId(this.userId);
      if (!response.success) return;

      this.defaultBackHref = RouteMap.ProfilePage.getPath(
        `@${response.data.handle}`
      );
    }
  }

  updateTileColCount() {
    const isSidebarEnabled =
      this.preferences[GlobalPreferenceKey.EnableSplitPane];
    const sidebarWidth = isSidebarEnabled ? 300 : 0;
    const homePageWidth = window.innerWidth - sidebarWidth;
    const tileColCount = Math.floor(homePageWidth / (TILE_WIDTH + TILE_PADD));

    if (tileColCount !== this.tileColCount) {
      this.tileColCount = tileColCount;

      this.datasource.adapter.reset();
    }
  }

  async fetchMoreRecipes(endIndex: number) {
    if (this.searchText) return;

    while (
      this.lastRecipeCount <= this.totalRecipeCount &&
      this.lastRecipeCount < endIndex + this.recipeFetchBuffer
    ) {
      await this.loadRecipes(this.lastRecipeCount, this.fetchPerPage);
    }
  }

  resetAndLoadAll(): Promise<any> {
    this.reloadPending = false;

    // Load labels & recipes in parallel if user hasn't selected labels that need to be verified for existence
    // Or if we're loading someone elses collection (in which case we can't verify)
    if (this.selectedLabels.length === 0 || this.userId) {
      return Promise.all([
        this.resetAndLoadLabels(),
        this.resetAndLoadRecipes(),
      ]);
    }

    return this.resetAndLoadLabels().then(() => {
      const labelNames = new Set(this.labels.map((e) => e.title));

      this.selectedLabels = this.selectedLabels.filter((e) =>
        labelNames.has(e)
      );

      return this.resetAndLoadRecipes();
    });
  }

  resetAndLoadLabels() {
    this.labels = [];
    return this.loadLabels();
  }

  resetAndLoadRecipes() {
    this.loading = true;
    this.resetRecipes();

    return this._resetAndLoadRecipes().then(
      () => {
        this.loading = false;
      },
      () => {
        this.loading = false;
      }
    );
  }

  async _resetAndLoadRecipes() {
    if (this.searchText && this.searchText.trim().length > 0) {
      await this.search(this.searchText);
    } else {
      await this.loadRecipes(0, this.fetchPerPage);
    }

    return this.datasource.adapter.reset();
  }

  resetRecipes() {
    this.recipes = [];
    this.lastRecipeCount = 0;
  }

  async loadRecipes(offset: number, numToFetch: number) {
    this.lastRecipeCount += numToFetch;

    const includeFriends =
      !this.userId &&
      (this.preferences[MyRecipesPreferenceKey.IncludeFriends] === "yes" ||
        this.preferences[MyRecipesPreferenceKey.IncludeFriends] === "browse");

    // const asdf = this.trpcService.trpc.getRecipes.query({
    //   userId: '2e4ed3ea-019f-45f2-a489-7c23554dcf06',
    // });
    //
    // console.log(asdf);

    // this.trpcService.trpc.getRecipes
    //   .query({
    //     example: "testval",
    //   })
    //   .then((val) => {
    //     console.log(val);
    //   });
    const response = await this.recipeService.fetch({
      folder: this.folder,
      sort: this.preferences[MyRecipesPreferenceKey.SortBy],
      offset,
      count: numToFetch,
      labelIntersection:
        this.preferences[MyRecipesPreferenceKey.EnableLabelIntersection],
      labels: this.selectedLabels.join(",") || undefined,
      ratingFilter: this.ratingFilter.map(String).join(",") || undefined,
      userId: this.userId || undefined,
      includeFriends,
    });
    if (!response.success) return;

    this.totalRecipeCount = response.data.totalCount;
    this.recipes = this.recipes.concat(response.data.data);
  }

  async loadLabels() {
    const response = await this.labelService.fetch();
    if (!response.success) return;

    this.labels = response.data;
  }

  async fetchMyProfile() {
    const response = await this.userService.getMyProfile();
    if (!response.success) return;

    this.myProfile = response.data;
  }

  async fetchFriends() {
    const response = await this.userService.getMyFriends();
    if (!response.success) return;

    this.friendsById = response.data.friends.reduce((acc, friendEntry) => {
      acc[friendEntry.otherUser.id] = friendEntry.otherUser;
      return acc;
    }, {});
  }

  toggleLabel(labelTitle) {
    const labelIdx = this.selectedLabels.indexOf(labelTitle);
    labelIdx > -1
      ? this.selectedLabels.splice(labelIdx, 1)
      : this.selectedLabels.push(labelTitle);
    this.resetAndLoadRecipes();
  }

  openRecipe(recipe, event?) {
    if (event && (event.metaKey || event.ctrlKey)) {
      window.open(`#/recipe/${recipe.id}`);
      return;
    }
    this.navCtrl.navigateForward(RouteMap.RecipePage.getPath(recipe.id));
  }

  async presentPopover(event) {
    const popover = await this.popoverCtrl.create({
      component: HomePopoverPage,
      componentProps: {
        guestMode: !!this.userId,
        selectionMode: this.selectionMode,
      },
      event,
    });

    popover.onDidDismiss().then(({ data }) => {
      if (!data) return;

      if (typeof data.selectionMode === "boolean") {
        this.selectionMode = data.selectionMode;
        if (!this.selectionMode) {
          this.clearSelectedRecipes();
        }
      }
      if (data.refreshSearch) this.resetAndLoadRecipes();
    });

    popover.present();
  }

  newRecipe() {
    this.navCtrl.navigateForward(RouteMap.EditRecipePage.getPath("new"));
  }

  async search(text) {
    if (text.trim().length === 0) {
      this.searchText = "";
      this.resetAndLoadRecipes();
      return;
    }

    const loading = this.loadingService.start();

    this.searchText = text;

    const includeFriends =
      !this.userId &&
      (this.preferences[MyRecipesPreferenceKey.IncludeFriends] === "yes" ||
        this.preferences[MyRecipesPreferenceKey.IncludeFriends] === "search");

    const response = await this.recipeService.search({
      query: text,
      labels: this.selectedLabels.join(",") || undefined,
      userId: this.userId || undefined,
      ratingFilter: this.ratingFilter.map(String).join(",") || undefined,
      includeFriends,
    });
    loading.dismiss();
    if (!response.success) return;

    this.resetRecipes();
    this.recipes = response.data.data;
    this.datasource.adapter.reset();
  }

  trackByFn(index, item) {
    return item.id;
  }

  selectRecipe(recipe) {
    const index = this.selectedRecipeIds.indexOf(recipe.id);
    if (index > -1) {
      this.selectedRecipeIds.splice(index, 1);
    } else {
      this.selectedRecipeIds.push(recipe.id);
    }
  }

  clearSelectedRecipes() {
    this.selectionMode = false;
    this.selectedRecipeIds = [];
  }

  async addLabelToSelectedRecipes() {
    const header = await this.translate
      .get("pages.home.addLabel.header")
      .toPromise();
    const message = await this.translate
      .get("pages.home.addLabel.message")
      .toPromise();
    const placeholder = await this.translate
      .get("pages.home.addLabel.placeholder")
      .toPromise();
    const cancel = await this.translate.get("generic.cancel").toPromise();
    const save = await this.translate.get("generic.save").toPromise();

    const prompt = await this.alertCtrl.create({
      header,
      message,
      inputs: [
        {
          name: "labelName",
          placeholder,
        },
      ],
      buttons: [
        {
          text: cancel,
        },
        {
          text: save,
          handler: async ({ labelName }) => {
            const loading = this.loadingService.start();
            const response = await this.labelService.createBulk({
              recipeIds: this.selectedRecipeIds,
              title: labelName.toLowerCase(),
            });
            if (!response.success) return loading.dismiss();
            await this.resetAndLoadAll();
            loading.dismiss();
          },
        },
      ],
    });
    prompt.present();
  }

  async deleteSelectedRecipes() {
    const recipeNames = this.selectedRecipeIds
      .map(
        (recipeId) =>
          this.recipes.filter((recipe) => recipe.id === recipeId)[0].title
      )
      .join(", ");

    const header = await this.translate
      .get("pages.home.deleteSelected.header")
      .toPromise();
    const message = await this.translate
      .get("pages.home.deleteSelected.message", { recipeNames })
      .toPromise();
    const cancel = await this.translate.get("generic.cancel").toPromise();
    const del = await this.translate.get("generic.delete").toPromise();

    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        {
          text: cancel,
          role: "cancel",
          handler: () => {},
        },
        {
          text: del,
          cssClass: "alertDanger",
          handler: async () => {
            const loading = this.loadingService.start();
            const response = await this.recipeService.deleteBulk({
              recipeIds: this.selectedRecipeIds,
            });
            if (!response.success) return loading.dismiss();
            this.clearSelectedRecipes();

            this.resetAndLoadAll();
            loading.dismiss();
          },
        },
      ],
    });
    alert.present();
  }

  getCardClass(recipe: Recipe) {
    return {
      selected: this.selectedRecipeIds.includes(recipe.id),

      // The following should be generic to all recipes listed for height consistency
      showImage: this.preferences[this.preferenceKeys.ShowImages],
      showDescription:
        this.preferences[this.preferenceKeys.ShowRecipeDescription],
      showSource: this.preferences[this.preferenceKeys.ShowSource],
      showFromUser: this.folder === "inbox",
      showLabels: this.preferences[this.preferenceKeys.ShowLabels],
    };
  }

  getLabelList(recipe: Recipe) {
    return recipe.labels.map((label) => label.title).join(", ");
  }

  getShouldShowLabelChips() {
    return (
      this.labels.length &&
      !this.userId &&
      this.preferences[this.preferenceKeys.ShowLabelChips] &&
      this.folder === "main"
    );
  }

  async showSearchFilter(event) {
    const modal = await this.popoverCtrl.create({
      event,
      component: HomeSearchFilterPopoverPage,
      componentProps: {
        guestMode: !!this.userId,
        labels: this.labels,
        selectedLabels: this.selectedLabels,
        ratingFilter: this.ratingFilter,
      },
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (!data) return;

    if (data.selectedLabels) this.selectedLabels = data.selectedLabels;
    if (data.ratingFilter) this.ratingFilter = data.ratingFilter;
    if (data.refreshSearch) this.resetAndLoadRecipes();
  }
}
