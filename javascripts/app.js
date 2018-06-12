var app = angular.module("app", ["ngStorage", "pascalprecht.translate", "smart-table", "ngFileUpload"]);

app.factory('TranslationService', function ($localStorage) {
	return {
		getLanguage : function () {
			return $localStorage.language;
		},
		setLanguage: function (language) {
			$localStorage.language = language;
		}
	};
});


app.factory('CacheService', function ($localStorage) {
	return {
		getKeys : function () {
			return $localStorage.keys;
		},
		setKeys: function (keys) {
			$localStorage.keys = keys;
		},
		getTranslations : function () {
			return $localStorage.translations;
		},
		setTranslations: function (translations) {
			$localStorage.translations = translations;
		},
		getLocales : function () {
			return $localStorage.locales;
		},
		setLocales: function (locales) {
			$localStorage.locales = locales;
		}
	};
});

app.factory("fileReader", function($q, $log) {
	var onLoad = function(reader, deferred, scope) {
		return function() {
			scope.$apply(function() {
				deferred.resolve(reader.result);
			});
		};
	};

	var onError = function(reader, deferred, scope) {
		return function() {
			scope.$apply(function() {
				deferred.reject(reader.result);
			});
		};
	};

	var onProgress = function(reader, scope) {
		return function(event) {
			scope.$broadcast("fileProgress", {
				total: event.total,
				loaded: event.loaded
			});
		};
	};

	var getReader = function(deferred, scope) {
		var reader = new FileReader();
		reader.onload = onLoad(reader, deferred, scope);
		reader.onerror = onError(reader, deferred, scope);
		reader.onprogress = onProgress(reader, scope);
		return reader;
	};

	var readAsDataURL = function(file, scope) {
		var deferred = $q.defer();

		var reader = getReader(deferred, scope);
		reader.readAsDataURL(file);

		return deferred.promise;
	};

	var readAsText = function(file, scope) {
		var deferred = $q.defer();

		var reader = getReader(deferred, scope);
		reader.readAsText(file);

		return deferred.promise;
	};

	return {
		readAsDataUrl: readAsDataURL,
		readAsText: readAsText
	};
});

/* TRANSLATION CONFIGURATION START */
app.config(function ($translateProvider) {
	// Security measure
	$translateProvider.useSanitizeValueStrategy('escape');
	$translateProvider.useStaticFilesLoader({
		prefix: '/i18n/locale-',
		suffix: '.json'
	});
	$translateProvider.preferredLanguage('en');
});
/* TRANSLATION CONFIGURATION END */

// Pagination fix for bootstrap 4 with smart table
app.run(function($templateCache) {
	$templateCache.put('template/smart-table/pagination.html',
		'<div class="pagination mx-auto" ng-if="pages.length >= 2"><ul class="pagination">' +
		'<li class="page-item" ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a class="page-link" ng-click="selectPage(page)">{{page}}</a></li>' +
		'</ul></div>');
});

/* CONTROLLERS START */
app.controller('headerCtrl', function($scope, $translate, TranslationService) {
	$scope.selectedLanguage = TranslationService.getLanguage();
	$translate.use($scope.selectedLanguage);

	$scope.changeLanguage = function () {
		$translate.use($scope.selectedLanguage);
		TranslationService.setLanguage($scope.selectedLanguage);
	};
});

app.controller('coreCtrl', function($scope, $http, $timeout, fileReader, CacheService) {
	$scope.keys = CacheService.getKeys() || [];
	$scope.translations = CacheService.getTranslations() || [];
	$scope.newEmptyLanguage = "";
	$scope.newKey = "";
	$scope.locales = CacheService.getLocales() || {};
	$scope.selectedTranslation = "";

	$http
		.get('./static/locales.json')
		.then(function(response){
			$scope.locales = response.data;
			CacheService.setLocales($scope.locales);
			console.log($scope.locales);
		});

	$scope.addEmptyLanguage = function(){
		console.log($scope.newEmptyLanguage);
		if($scope.newEmptyLanguage.length > 0) {
			$scope.translations.push({
				"name": $scope.newEmptyLanguage,
				"data": {}
			});
			$scope.newEmptyLanguage = "";
		}
	};

	$scope.addKey = function(){
		console.log($scope.newKey);
		if($scope.newKey.length > 0) {
			var index = $scope.keys.indexOf($scope.newKey);
			if (index == -1) {
				$scope.keys.push( $scope.newKey );
				$scope.newKey = "";
			}
		}
	};

	$scope.$watch('files', function () {
		$scope.addLanguageFiles($scope.files);
	});

	$scope.addLanguageFiles = function (files) {
		if (files && files.length) {
			for (var i = 0; i < files.length; i++) {
				var file = files[i];
				if (!file.$error) {
					console.log(file);
					fileReader.readAsText(file, $scope)
						.then(function(result) {
							var tmpData = JSON.parse(result);
							$scope.translations.push({
								"name": file.name,
								"data": tmpData
							});
							console.log(tmpData);
							$scope.mergeKeys(JSON.parse(JSON.stringify(tmpData)));
						});
				}
			}
		}
	};

	$scope.mergeKeys = function(newPairs){
		$scope.keys.forEach(function (key){
			delete newPairs[key];
		});

		Object.keys(newPairs).forEach(function (newKey){
			$scope.keys.push(newKey);
		});
	};

	$scope.deleteKey = function (key){
		var index = $scope.keys.indexOf(key);
		if (index > -1) {
			$scope.keys.splice(index, 1);
		}

		$scope.translations.forEach(function(translation){
			delete translation.data[key];
		});
	};

	$scope.setSelectedTranslation = function(translation){
		$scope.selectedTranslation = translation;
	};

	$scope.deleteSelectedTranslation = function (){
		var index = -1;
		for(var i = 0; i < $scope.translations.length; i++){
			if($scope.translations[i].name === $scope.selectedTranslation){
				index = i;
			}
		}

		if (index > -1) {
			$scope.translations.splice(index, 1);
		}
	};


	$scope.download = function (){
		var zip = new JSZip();

		$scope.translations.forEach(function(translation){
			zip.file(translation.name + '.json', JSON.stringify(translation.data));
		});

		// Generate the zip file asynchronously
		zip.generateAsync({type:"blob"})
			.then(function(content) {
				var newDate = new Date();
				var filename = 'locales_' + newDate.getFullYear()+'_'+parseInt(newDate.getMonth()+1)+'_'+newDate.getDate()+'__'+newDate.getHours()+'_'+newDate.getMinutes() + '.zip';

				// Force down of the Zip file
				saveAs(content, filename);
			});
	};

	$scope.$watch('keys', function () {
		CacheService.setKeys($scope.keys);
	});

	$scope.$watch('translations', function () {
		CacheService.setTranslations($scope.translations);
	});
});
/* CONTROLLERS END */